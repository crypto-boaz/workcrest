from decimal import Decimal

import pytest
from django.db import connection
from rest_framework.test import APIClient

from commerce.models import Customer, Product
from organizations.models import TenantModule
from organizations.tenancy import organization_context
from subscriptions.models import Subscription


pytestmark = pytest.mark.django_db


def create_product(*, organization, location, name):
    return Product.objects.create(
        organization=organization,
        location=location,
        name=name,
        sku="SHARED-SKU",
        selling_price=Decimal("1000"),
        cost_price=Decimal("600"),
    )


def test_identical_tenant_values_do_not_collide(tenant_pair):
    product_a = create_product(
        organization=tenant_pair.organization_a,
        location=tenant_pair.location_a,
        name="Company A Product",
    )
    product_b = create_product(
        organization=tenant_pair.organization_b,
        location=tenant_pair.location_b,
        name="Company B Product",
    )
    customer_a = Customer.objects.create(
        organization=tenant_pair.organization_a,
        location=tenant_pair.location_a,
        name="Shared Customer",
        email="same@example.test",
    )
    customer_b = Customer.objects.create(
        organization=tenant_pair.organization_b,
        location=tenant_pair.location_b,
        name="Shared Customer",
        email="same@example.test",
    )

    assert product_a.sku == product_b.sku
    assert product_a.id != product_b.id
    assert customer_a.email == customer_b.email


def test_host_tenant_cannot_address_another_tenants_location(tenant_pair):
    client = APIClient()
    client.force_authenticate(tenant_pair.owner_a)
    response = client.get(
        f"/api/v1/locations/{tenant_pair.location_b.id}/products/",
        HTTP_X_TENANT_SLUG=tenant_pair.organization_a.slug,
    )
    assert response.status_code == 404


def test_single_host_session_resolves_only_an_accessible_tenant(
    tenant_pair, settings
):
    settings.DEBUG = False
    settings.SINGLE_HOST_TENANCY = True
    settings.ALLOWED_HOSTS = ["testserver", "workcrest.vercel.app"]
    client = APIClient()
    client.force_login(tenant_pair.owner_a)
    session = client.session
    session["active_tenant_slug"] = tenant_pair.organization_b.slug
    session.save()

    response = client.get(
        "/api/v1/bootstrap/",
        HTTP_HOST="workcrest.vercel.app",
    )

    assert response.status_code == 200
    assert response.json()["organization"]["id"] == str(
        tenant_pair.organization_a.id
    )
    assert client.session["active_tenant_slug"] == (
        tenant_pair.organization_a.slug
    )
    tenant_pair.owner_a.refresh_from_db()
    assert tenant_pair.owner_a.active_organization_id == (
        tenant_pair.organization_a.id
    )


def test_disabled_module_rejects_reads_and_writes(tenant_pair):
    TenantModule.objects.filter(
        organization=tenant_pair.organization_a,
        module__code="commerce",
    ).update(status=TenantModule.Status.DISABLED)
    client = APIClient()
    client.force_authenticate(tenant_pair.owner_a)
    response = client.get(
        f"/api/v1/locations/{tenant_pair.location_a.id}/products/",
        HTTP_X_TENANT_SLUG=tenant_pair.organization_a.slug,
    )
    assert response.status_code == 403
    assert response.json()["code"] == "permission_denied"


def test_grace_subscription_allows_reads_but_blocks_writes(tenant_pair):
    Subscription.objects.filter(
        organization=tenant_pair.organization_a
    ).update(status=Subscription.Status.GRACE)
    client = APIClient()
    client.force_authenticate(tenant_pair.owner_a)
    url = f"/api/v1/locations/{tenant_pair.location_a.id}/products/"
    read_response = client.get(
        url, HTTP_X_TENANT_SLUG=tenant_pair.organization_a.slug
    )
    write_response = client.post(
        url,
        {
            "name": "Blocked Product",
            "sku": "BLOCKED",
            "unit": "item",
            "selling_price": "1000.00",
            "cost_price": "500.00",
            "reorder_level": "1.000",
            "custom_data": {},
        },
        format="json",
        HTTP_X_TENANT_SLUG=tenant_pair.organization_a.slug,
    )
    assert read_response.status_code == 200
    assert write_response.status_code == 403


@pytest.mark.skipif(
    connection.vendor != "postgresql",
    reason="PostgreSQL RLS is verified against PostgreSQL only.",
)
def test_postgresql_rls_blocks_direct_cross_tenant_queries(tenant_pair):
    with organization_context(tenant_pair.organization_a.id):
        create_product(
            organization=tenant_pair.organization_a,
            location=tenant_pair.location_a,
            name="Visible A",
        )
    with organization_context(tenant_pair.organization_b.id):
        create_product(
            organization=tenant_pair.organization_b,
            location=tenant_pair.location_b,
            name="Hidden B",
        )
    with organization_context(tenant_pair.organization_a.id):
        names = list(Product.objects.values_list("name", flat=True))
        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM commerce_product")
            raw_count = cursor.fetchone()[0]
    assert names == ["Visible A"]
    assert raw_count == 1
