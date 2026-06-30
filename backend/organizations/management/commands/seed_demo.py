from decimal import Decimal

from allauth.account.models import EmailAddress
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from commerce.models import Category, Customer, Expense, Payment, Product, Supplier
from commerce.services import apply_stock, complete_sale
from notifications.services import notify_organization
from organizations.models import Organization
from organizations.services import provision_organization
from organizations.tenancy import organization_context
from subscriptions.models import Subscription


class Command(BaseCommand):
    help = "Seed Timphat Cosmetics as tenant one with realistic Commerce data."

    def add_arguments(self, parser):
        parser.add_argument(
            "--password",
            default="ChangeMe-2026!",
            help="Demo owner password.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        User = get_user_model()
        owner, _ = User.objects.get_or_create(
            email="owner@timphat.local",
            defaults={"full_name": "Timphat Owner", "is_active": True},
        )
        owner.set_password(options["password"])
        owner.save(update_fields=["password"])
        EmailAddress.objects.update_or_create(
            user=owner,
            email=owner.email,
            defaults={"verified": True, "primary": True},
        )
        organization = Organization.objects.filter(slug="timphat").first()
        if organization is None:
            organization, location = provision_organization(
                owner=owner,
                name="Timphat Cosmetics",
                legal_name="Timphat Cosmetics",
                slug="timphat",
                industry_code="beauty-cosmetics",
                location_name="Main Store",
            )
        else:
            location = organization.location_set.get(is_primary=True)
        with organization_context(organization.id):
            self._seed_commerce(organization, location, owner)
        self.stdout.write(
            self.style.SUCCESS(
                "Seeded Timphat Cosmetics. Login: owner@timphat.local"
            )
        )

    def _seed_commerce(self, organization, location, owner):
        category, _ = Category.objects.get_or_create(
            organization=organization,
            location=location,
            slug="skincare",
            defaults={"name": "Skincare"},
        )
        product_specs = [
            ("Radiance Body Oil", "TIMP-OIL-001", "18500", "11200", "24"),
            ("Hydrating Face Serum", "TIMP-SER-002", "14500", "8500", "17"),
            ("Shea Body Butter", "TIMP-BUT-003", "9500", "5400", "9"),
            ("Gentle Cleanser", "TIMP-CLN-004", "12000", "6900", "4"),
        ]
        products = []
        for name, sku, selling, cost, opening in product_specs:
            product, created = Product.objects.get_or_create(
                organization=organization,
                location=location,
                sku=sku,
                defaults={
                    "name": name,
                    "category": category,
                    "selling_price": Decimal(selling),
                    "cost_price": Decimal(cost),
                    "reorder_level": Decimal("5"),
                },
            )
            products.append(product)
            if created:
                apply_stock(
                    product=product,
                    delta=Decimal(opening),
                    kind="opening",
                    actor=owner,
                    source_type="DemoSeed",
                    source_id=product.id,
                )
        customer, _ = Customer.objects.get_or_create(
            organization=organization,
            location=location,
            email="ada@example.test",
            defaults={"name": "Adaeze Okafor", "phone": "+234 803 555 0101"},
        )
        Supplier.objects.get_or_create(
            organization=organization,
            location=location,
            email="orders@naturalingredients.test",
            defaults={
                "name": "Natural Ingredients Nigeria",
                "contact_name": "Chidi Eze",
                "phone": "+234 809 555 0102",
            },
        )
        if not organization.sale_set.exists():
            complete_sale(
                organization=organization,
                location=location,
                actor=owner,
                items=[
                    {"product_id": str(products[0].id), "quantity": "2"},
                    {"product_id": str(products[1].id), "quantity": "1"},
                ],
                payment_method=Payment.Method.TRANSFER,
                customer=customer,
                idempotency_key="demo-initial-sale",
            )
        Expense.objects.get_or_create(
            organization=organization,
            location=location,
            title="Store internet subscription",
            incurred_at__date=timezone.localdate(),
            defaults={
                "category": "Utilities",
                "amount": Decimal("25000"),
                "currency": organization.currency,
                "payment_method": Payment.Method.TRANSFER,
                "created_by": owner,
            },
        )
        if not organization.notification_set.filter(
            title="Welcome to your workspace"
        ).exists():
            notify_organization(
                organization=organization,
                location=location,
                title="Welcome to your workspace",
                body=(
                    "Timphat Cosmetics is ready. Review your stock and invite "
                    "your staff."
                ),
                tone="success",
                href="/dashboard",
                created_by=owner,
            )
        subscription = Subscription.objects.get(organization=organization)
        self.stdout.write(
            f"Trial ends {subscription.trial_ends_at:%Y-%m-%d}; "
            f"primary location {location.name}."
        )
