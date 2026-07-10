from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from subscriptions.models import Plan, PlanModule, Subscription

from .models import (
    BrandingProfile,
    Capability,
    Location,
    Membership,
    ModuleDefinition,
    Organization,
    Role,
    RoleAssignment,
    RoleCapability,
    TenantDomain,
    TenantModule,
)
from .tenancy import activate_organization


COMMERCE_CAPABILITIES = {
    "products.view": "View products",
    "products.manage": "Manage products",
    "inventory.view": "View inventory",
    "inventory.manage": "Manage inventory",
    "inventory.adjust": "Adjust inventory",
    "dashboard.view": "View operational dashboard",
    "sales.view": "View sales",
    "sales.create": "Create sales",
    "sales.checkout": "Complete sales",
    "returns.view": "View returns",
    "returns.create": "Process returns",
    "returns.process": "Process returns",
    "customers.manage": "Manage customers",
    "suppliers.manage": "Manage suppliers",
    "purchases.view": "View purchases",
    "purchases.manage": "Manage purchases",
    "purchases.receive": "Receive purchases",
    "transfers.view": "View stock transfers",
    "transfers.manage": "Manage stock transfers",
    "expenses.view": "View expenses",
    "expenses.manage": "Manage expenses",
    "reports.view": "View reports",
    "reports.export": "Export reports",
    "staff.manage": "Manage staff",
    "settings.manage": "Manage organization settings",
}

ROLE_CAPABILITIES = {
    "owner": list(COMMERCE_CAPABILITIES),
    "manager": list(COMMERCE_CAPABILITIES),
    "cashier": [
        "products.view",
        "inventory.view",
        "sales.view",
        "sales.create",
        "sales.checkout",
        "returns.view",
        "returns.create",
        "returns.process",
        "customers.manage",
    ],
    "inventory": [
        "products.view",
        "products.manage",
        "inventory.view",
        "inventory.manage",
        "inventory.adjust",
        "suppliers.manage",
        "purchases.view",
        "purchases.manage",
        "purchases.receive",
        "transfers.view",
        "transfers.manage",
        "reports.view",
    ],
}


def ensure_platform_catalog():
    commerce_module, _ = ModuleDefinition.objects.get_or_create(
        code="commerce",
        defaults={
            "name": "Commerce",
            "description": "Products, inventory, POS, purchasing, returns and expenses.",
            "navigation": [
                "dashboard",
                "products",
                "sales",
                "pos",
                "customers",
                "purchases",
                "returns",
                "people",
                "expenses",
                "reports",
                "alerts",
            ],
        },
    )
    capabilities = {}
    for code, name in COMMERCE_CAPABILITIES.items():
        capability, _ = Capability.objects.get_or_create(
            code=code,
            defaults={"name": name, "module_code": "commerce"},
        )
        capabilities[code] = capability

    starter, _ = Plan.objects.get_or_create(
        code="starter",
        defaults={
            "name": "Starter",
            "limits": {"locations": 1, "active_staff": 5},
            "features": ["commerce", "basic_reports", "data_export"],
            "sort_order": 10,
        },
    )
    growth, _ = Plan.objects.get_or_create(
        code="growth",
        defaults={
            "name": "Growth",
            "limits": {"locations": 5, "active_staff": 25},
            "features": [
                "commerce",
                "stock_transfers",
                "custom_roles",
                "advanced_reports",
                "data_export",
            ],
            "sort_order": 20,
        },
    )
    enterprise, _ = Plan.objects.get_or_create(
        code="enterprise",
        defaults={
            "name": "Enterprise",
            "limits": {"locations": None, "active_staff": None},
            "features": ["*"],
            "sort_order": 30,
        },
    )
    for plan in (starter, growth, enterprise):
        PlanModule.objects.get_or_create(plan=plan, module=commerce_module)
    return commerce_module, capabilities, starter


@transaction.atomic
def provision_organization(
    *,
    owner,
    name,
    slug,
    industry_code="commerce",
    location_name="Main Store",
    location_kind=Location.Kind.STORE,
    legal_name="",
):
    module, capabilities, starter = ensure_platform_catalog()
    organization = Organization(
        name=name,
        legal_name=legal_name,
        slug=slug,
        industry_code=industry_code,
        status=Organization.Status.TRIAL,
    )
    organization.full_clean()
    organization.save()
    activate_organization(organization.id)

    TenantDomain.objects.create(
        organization=organization,
        domain=f"{slug}.{settings.PLATFORM_DOMAIN}",
        kind=TenantDomain.Kind.SUBDOMAIN,
        verified_at=timezone.now(),
    )
    BrandingProfile.objects.create(
        organization=organization,
        display_name=name,
        receipt_header=name,
        terminology={
            "location": "Store" if location_kind == Location.Kind.STORE else "Location",
            "customer": "Customer",
            "supplier": "Supplier",
            "product": "Product",
            "sale": "Sale",
        },
        document_prefixes={"sale": "SALE", "purchase": "PO", "return": "RET"},
    )
    location = Location.objects.create(
        organization=organization,
        name=location_name,
        code="MAIN",
        kind=location_kind,
        is_primary=True,
    )
    membership = Membership.objects.create(
        organization=organization,
        user=owner,
        status=Membership.Status.ACTIVE,
        is_owner=True,
        title="Owner",
    )
    owner.active_organization_id = organization.id
    owner.save(update_fields=["active_organization_id"])

    roles = {}
    for code, capability_codes in ROLE_CAPABILITIES.items():
        role = Role.objects.create(
            organization=organization,
            code=code,
            name=code.title(),
            is_system=True,
        )
        roles[code] = role
        RoleCapability.objects.bulk_create(
            [
                RoleCapability(
                    organization=organization,
                    role=role,
                    capability=capabilities[item],
                )
                for item in capability_codes
            ]
        )
    RoleAssignment.objects.create(
        organization=organization,
        membership=membership,
        role=roles["owner"],
        location=None,
    )
    TenantModule.objects.create(
        organization=organization,
        module=module,
        status=TenantModule.Status.ACTIVE,
        activated_by=owner,
    )
    Subscription.objects.create(
        organization=organization,
        plan=starter,
        status=Subscription.Status.TRIALING,
        trial_ends_at=timezone.now() + timedelta(days=14),
    )
    return organization, location
