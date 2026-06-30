from decimal import Decimal

import pytest
from allauth.account.models import EmailAddress
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from commerce.models import Product
from organizations.models import (
    BrandingProfile,
    CustomFieldDefinition,
    Location,
    Membership,
    Role,
    RoleAssignment,
)


pytestmark = pytest.mark.django_db


def test_manifest_and_bootstrap_are_runtime_tenant_specific(tenant_pair):
    client = APIClient()
    platform_manifest = client.get("/api/v1/tenant-manifest/")
    manifest = client.get(
        "/api/v1/tenant-manifest/",
        HTTP_X_TENANT_SLUG=tenant_pair.organization_a.slug,
    )
    client.force_authenticate(tenant_pair.owner_a)
    bootstrap = client.get(
        "/api/v1/bootstrap/",
        HTTP_X_TENANT_SLUG=tenant_pair.organization_a.slug,
    )

    assert platform_manifest.status_code == 200
    assert platform_manifest.json()["branding"]["display_name"] == "Workcrest"
    assert manifest.status_code == 200
    assert manifest.json()["branding"]["display_name"] == "Company A"
    assert bootstrap.status_code == 200
    assert bootstrap.json()["organization"]["id"] == str(
        tenant_pair.organization_a.id
    )
    assert bootstrap.json()["locations"][0]["id"] == str(
        tenant_pair.location_a.id
    )
    assert bootstrap.json()["modules"][0]["code"] == "commerce"


def test_custom_fields_reject_unknown_and_validate_configured_values(
    tenant_pair,
):
    CustomFieldDefinition.objects.create(
        organization=tenant_pair.organization_a,
        module_code="commerce",
        entity_type="product",
        key="shade",
        label="Shade",
        field_type=CustomFieldDefinition.FieldType.SELECT,
        options=["Light", "Deep"],
        required=True,
    )
    client = APIClient()
    client.force_authenticate(tenant_pair.owner_a)
    url = f"/api/v1/locations/{tenant_pair.location_a.id}/products/"
    common = {
        "name": "Foundation",
        "sku": "FOUND-001",
        "unit": "item",
        "selling_price": "9000.00",
        "cost_price": "5000.00",
        "reorder_level": "2.000",
    }
    unknown = client.post(
        url,
        {**common, "custom_data": {"unapproved": "value"}},
        format="json",
        HTTP_X_TENANT_SLUG=tenant_pair.organization_a.slug,
    )
    invalid = client.post(
        url,
        {**common, "custom_data": {"shade": "Medium"}},
        format="json",
        HTTP_X_TENANT_SLUG=tenant_pair.organization_a.slug,
    )
    valid = client.post(
        url,
        {**common, "custom_data": {"shade": "Deep"}},
        format="json",
        HTTP_X_TENANT_SLUG=tenant_pair.organization_a.slug,
    )

    assert unknown.status_code == 400
    assert invalid.status_code == 400
    assert valid.status_code == 201
    assert Product.objects.get(id=valid.json()["id"]).custom_data == {
        "shade": "Deep"
    }


def test_location_scoped_role_does_not_grant_other_location_access(tenant_pair):
    User = get_user_model()
    employee = User.objects.create_user(
        email="cashier@example.test",
        password="Strong-Test-Password-3!",
        full_name="Cashier",
    )
    membership = Membership.objects.create(
        organization=tenant_pair.organization_a,
        user=employee,
        status=Membership.Status.ACTIVE,
    )
    cashier_role = Role.objects.get(
        organization=tenant_pair.organization_a, code="cashier"
    )
    RoleAssignment.objects.create(
        organization=tenant_pair.organization_a,
        membership=membership,
        role=cashier_role,
        location=tenant_pair.location_a,
    )
    other_location = Location.objects.create(
        organization=tenant_pair.organization_a,
        name="Other Store",
        code="OTHER",
    )
    client = APIClient()
    client.force_authenticate(employee)
    allowed = client.get(
        f"/api/v1/locations/{tenant_pair.location_a.id}/sales/",
        HTTP_X_TENANT_SLUG=tenant_pair.organization_a.slug,
    )
    denied = client.get(
        f"/api/v1/locations/{other_location.id}/sales/",
        HTTP_X_TENANT_SLUG=tenant_pair.organization_a.slug,
    )

    assert allowed.status_code == 200
    assert denied.status_code == 403


def test_owner_company_settings_update_propagates_to_bootstrap(
    tenant_pair, settings, tmp_path
):
    settings.MEDIA_ROOT = tmp_path
    EmailAddress.objects.create(
        user=tenant_pair.owner_a,
        email=tenant_pair.owner_a.email,
        verified=True,
        primary=True,
    )
    client = APIClient()
    login = client.post(
        "/api/v1/auth/browser/v1/auth/login",
        {
            "email": tenant_pair.owner_a.email,
            "password": "Strong-Test-Password-1!",
        },
        format="json",
    )
    assert login.status_code == 200

    response = client.patch(
        "/api/v1/company-settings/",
        {
            "name": "Renamed Company A",
            "slug": "owner-cannot-change-this",
            "primary_color": "#7C3AED",
            "currency": "USD",
            "receipt_header": "Renamed Company A",
            "receipt_footer": "Thanks for your business.",
            "address": {
                "line1": "12 Market Road",
                "city": "Lagos",
                "state": "Lagos",
                "country": "Nigeria",
            },
        },
        format="json",
        HTTP_X_TENANT_SLUG=tenant_pair.organization_a.slug,
    )
    bootstrap = client.get(
        "/api/v1/bootstrap/",
        HTTP_X_TENANT_SLUG=tenant_pair.organization_a.slug,
    )
    location_update = client.patch(
        f"/api/v1/locations/{tenant_pair.location_a.id}/",
        {"name": "Owner cannot rename this location"},
        format="json",
        HTTP_X_TENANT_SLUG=tenant_pair.organization_a.slug,
    )

    assert response.status_code == 200
    assert location_update.status_code == 405
    assert bootstrap.status_code == 200
    assert bootstrap.json()["organization"]["name"] == "Renamed Company A"
    assert bootstrap.json()["organization"]["currency"] == "USD"
    assert bootstrap.json()["branding"]["display_name"] == "Renamed Company A"
    assert (
        BrandingProfile.objects.get(
            organization=tenant_pair.organization_a
        ).primary_color
        == "#7C3AED"
    )
    tenant_pair.organization_a.refresh_from_db()
    assert tenant_pair.organization_a.slug == "company-a"

    logo = SimpleUploadedFile(
        "company-logo.png",
        b"\x89PNG\r\n\x1a\nworkcrest-test-image",
        content_type="image/png",
    )
    logo_response = client.post(
        "/api/v1/company-logo/",
        {"logo": logo},
        format="multipart",
        HTTP_X_TENANT_SLUG=tenant_pair.organization_a.slug,
    )
    assert logo_response.status_code == 200
    assert logo_response.json()["branding"]["logo_url"].endswith(".png")


def test_customers_and_purchases_are_platform_owner_only(tenant_pair):
    client = APIClient()
    client.force_authenticate(tenant_pair.owner_a)
    headers = {"HTTP_X_TENANT_SLUG": tenant_pair.organization_a.slug}

    customers = client.get(
        f"/api/v1/locations/{tenant_pair.location_a.id}/customers/",
        **headers,
    )
    purchases = client.get(
        f"/api/v1/locations/{tenant_pair.location_a.id}/purchases/",
        **headers,
    )

    assert customers.status_code == 403
    assert purchases.status_code == 403
    assert customers.json()["message"] == "Only admin access."


def test_onboarding_validates_slug_then_provisions_workspace():
    User = get_user_model()
    owner = User.objects.create_user(
        email="new-owner@example.test",
        password="Strong-Test-Password-4!",
        full_name="New Owner",
    )
    client = APIClient()
    client.force_authenticate(owner)

    response = client.post(
        "/api/v1/onboarding/",
        {
            "owner_name": "New Owner",
            "organization_name": "New Company",
            "slug": "New_Company",
            "industry_code": "commerce",
            "location_name": "Main Store",
            "location_kind": "store",
        },
        format="json",
    )

    assert response.status_code == 400
    assert "slug" in response.json()["field_errors"]

    valid_response = client.post(
        "/api/v1/onboarding/",
        {
            "owner_name": "New Owner",
            "organization_name": "New Company",
            "slug": "new-company",
            "industry_code": "commerce",
            "location_name": "Main Store",
            "location_kind": "store",
        },
        format="json",
    )

    assert valid_response.status_code == 201
    assert valid_response.json()["organization"]["slug"] == "new-company"
    assert valid_response.json()["tenant_domain"].startswith("new-company.")
