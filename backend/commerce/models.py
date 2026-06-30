from decimal import Decimal
import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from organizations.models import (
    Location,
    LocationOwnedModel,
    OrganizationOwnedModel,
)


class Category(LocationOwnedModel):
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=120)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "location", "slug"],
                name="unique_category_slug_per_location",
            )
        ]
        ordering = ["name"]

    def __str__(self):
        return self.name


class Product(LocationOwnedModel):
    class Unit(models.TextChoices):
        ITEM = "item", "Item"
        KILOGRAM = "kg", "Kilogram"
        LITRE = "litre", "Litre"
        METRE = "metre", "Metre"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        ARCHIVED = "archived", "Archived"

    category = models.ForeignKey(
        Category, null=True, blank=True, on_delete=models.SET_NULL
    )
    name = models.CharField(max_length=180)
    sku = models.CharField(max_length=80)
    barcode = models.CharField(max_length=100, blank=True)
    qr_identifier = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    unit = models.CharField(max_length=16, choices=Unit.choices, default=Unit.ITEM)
    selling_price = models.DecimalField(max_digits=18, decimal_places=2)
    cost_price = models.DecimalField(max_digits=18, decimal_places=2)
    reorder_level = models.DecimalField(
        max_digits=18, decimal_places=3, default=Decimal("0")
    )
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.ACTIVE
    )
    custom_data = models.JSONField(default=dict, blank=True)
    version = models.PositiveIntegerField(default=1)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "location", "sku"],
                name="unique_product_sku_per_location",
            ),
        ]
        ordering = ["name"]
        indexes = [
            models.Index(fields=["organization", "location", "status"]),
            models.Index(fields=["organization", "location", "barcode"]),
        ]

    def __str__(self):
        return self.name


class InventoryBalance(LocationOwnedModel):
    product = models.OneToOneField(
        Product, on_delete=models.CASCADE, related_name="inventory"
    )
    quantity = models.DecimalField(
        max_digits=18, decimal_places=3, default=Decimal("0")
    )

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity__gte=0),
                name="inventory_quantity_nonnegative",
            )
        ]


class StockMovement(LocationOwnedModel):
    class Kind(models.TextChoices):
        OPENING = "opening", "Opening balance"
        SALE = "sale", "Sale"
        RETURN = "return", "Return"
        PURCHASE = "purchase", "Purchase receipt"
        TRANSFER_OUT = "transfer_out", "Transfer out"
        TRANSFER_IN = "transfer_in", "Transfer in"
        ADJUSTMENT = "adjustment", "Adjustment"

    product = models.ForeignKey(
        Product, on_delete=models.PROTECT, related_name="stock_movements"
    )
    kind = models.CharField(max_length=24, choices=Kind.choices)
    quantity = models.DecimalField(max_digits=18, decimal_places=3)
    balance_after = models.DecimalField(max_digits=18, decimal_places=3)
    source_type = models.CharField(max_length=60, blank=True)
    source_id = models.CharField(max_length=80, blank=True)
    note = models.CharField(max_length=240, blank=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organization", "location", "product", "-created_at"])
        ]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("Stock movements are immutable.")
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Stock movements are immutable.")


class Customer(LocationOwnedModel):
    name = models.CharField(max_length=180)
    phone = models.CharField(max_length=32, blank=True)
    email = models.EmailField(blank=True)
    custom_data = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        indexes = [models.Index(fields=["organization", "location", "name"])]

    def __str__(self):
        return self.name


class Supplier(LocationOwnedModel):
    name = models.CharField(max_length=180)
    contact_name = models.CharField(max_length=180, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    email = models.EmailField(blank=True)
    custom_data = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class DocumentSequence(LocationOwnedModel):
    document_type = models.CharField(max_length=40)
    prefix = models.CharField(max_length=16)
    next_number = models.PositiveBigIntegerField(default=1)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "location", "document_type"],
                name="unique_document_sequence",
            )
        ]


class Sale(LocationOwnedModel):
    class Status(models.TextChoices):
        HELD = "held", "Held"
        COMPLETED = "completed", "Completed"
        PARTIALLY_RETURNED = "partially_returned", "Partially returned"
        REFUNDED = "refunded", "Refunded"
        VOID = "void", "Void"

    number = models.CharField(max_length=40)
    receipt_qr_identifier = models.UUIDField(
        default=uuid.uuid4, unique=True, editable=False
    )
    customer = models.ForeignKey(
        Customer, null=True, blank=True, on_delete=models.PROTECT
    )
    customer_name = models.CharField(max_length=180, default="Walk-in customer")
    status = models.CharField(
        max_length=24, choices=Status.choices, default=Status.COMPLETED
    )
    subtotal = models.DecimalField(max_digits=18, decimal_places=2)
    discount = models.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal("0")
    )
    total = models.DecimalField(max_digits=18, decimal_places=2)
    currency = models.CharField(max_length=3, default="NGN")
    cashier = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL
    )
    completed_at = models.DateTimeField(default=timezone.now)
    version = models.PositiveIntegerField(default=1)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "location", "number"],
                name="unique_sale_number_per_location",
            )
        ]
        ordering = ["-completed_at"]


class SaleItem(LocationOwnedModel):
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    product_name = models.CharField(max_length=180)
    sku = models.CharField(max_length=80)
    barcode = models.CharField(max_length=100, blank=True)
    product_qr_identifier = models.UUIDField()
    unit = models.CharField(max_length=16)
    quantity = models.DecimalField(max_digits=18, decimal_places=3)
    unit_price = models.DecimalField(max_digits=18, decimal_places=2)
    unit_cost = models.DecimalField(max_digits=18, decimal_places=2)
    line_total = models.DecimalField(max_digits=18, decimal_places=2)


class Payment(LocationOwnedModel):
    class Method(models.TextChoices):
        CASH = "cash", "Cash"
        CARD = "card", "Card"
        TRANSFER = "transfer", "Transfer"

    class Status(models.TextChoices):
        CONFIRMED = "confirmed", "Confirmed"
        PENDING = "pending", "Pending"
        REFUNDED = "refunded", "Refunded"

    sale = models.ForeignKey(Sale, on_delete=models.PROTECT, related_name="payments")
    method = models.CharField(max_length=16, choices=Method.choices)
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.CONFIRMED
    )
    reference = models.CharField(max_length=100, blank=True)
    received_at = models.DateTimeField(default=timezone.now)


class HeldCart(LocationOwnedModel):
    customer = models.ForeignKey(
        Customer, null=True, blank=True, on_delete=models.SET_NULL
    )
    items = models.JSONField(default=list)
    discount = models.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal("0")
    )
    held_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    expires_at = models.DateTimeField(null=True, blank=True)


class ReturnRecord(LocationOwnedModel):
    class Status(models.TextChoices):
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    number = models.CharField(max_length=40)
    sale = models.ForeignKey(Sale, on_delete=models.PROTECT, related_name="returns")
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.APPROVED
    )
    reason = models.CharField(max_length=240)
    total = models.DecimalField(max_digits=18, decimal_places=2)
    processed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "location", "number"],
                name="unique_return_number_per_location",
            )
        ]
        ordering = ["-created_at"]


class ReturnItem(LocationOwnedModel):
    return_record = models.ForeignKey(
        ReturnRecord, on_delete=models.CASCADE, related_name="items"
    )
    sale_item = models.ForeignKey(SaleItem, on_delete=models.PROTECT)
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    quantity = models.DecimalField(max_digits=18, decimal_places=3)
    unit_amount = models.DecimalField(max_digits=18, decimal_places=2)
    line_total = models.DecimalField(max_digits=18, decimal_places=2)


class PurchaseOrder(LocationOwnedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ORDERED = "ordered", "Ordered"
        RECEIVED = "received", "Received"
        CANCELLED = "cancelled", "Cancelled"

    number = models.CharField(max_length=40)
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.ORDERED
    )
    expected_at = models.DateField(null=True, blank=True)
    total = models.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal("0")
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL
    )
    received_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "location", "number"],
                name="unique_purchase_number_per_location",
            )
        ]
        ordering = ["-created_at"]


class PurchaseItem(LocationOwnedModel):
    purchase_order = models.ForeignKey(
        PurchaseOrder, on_delete=models.CASCADE, related_name="items"
    )
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    quantity = models.DecimalField(max_digits=18, decimal_places=3)
    unit_cost = models.DecimalField(max_digits=18, decimal_places=2)
    line_total = models.DecimalField(max_digits=18, decimal_places=2)


class StockTransfer(OrganizationOwnedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        DISPATCHED = "dispatched", "Dispatched"
        RECEIVED = "received", "Received"
        CANCELLED = "cancelled", "Cancelled"

    number = models.CharField(max_length=40)
    source_location = models.ForeignKey(
        Location, on_delete=models.PROTECT, related_name="outgoing_transfers"
    )
    destination_location = models.ForeignKey(
        Location, on_delete=models.PROTECT, related_name="incoming_transfers"
    )
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.DRAFT
    )
    note = models.CharField(max_length=240, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="created_stock_transfers",
    )
    dispatched_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "number"],
                name="unique_transfer_number_per_org",
            )
            ,
            models.CheckConstraint(
                condition=~models.Q(source_location=models.F("destination_location")),
                name="transfer_locations_must_differ",
            ),
        ]
        ordering = ["-created_at"]

    def clean(self):
        if (
            self.source_location.organization_id != self.organization_id
            or self.destination_location.organization_id != self.organization_id
        ):
            raise ValidationError("Transfer locations must belong to the organization.")


class TransferItem(OrganizationOwnedModel):
    transfer = models.ForeignKey(
        StockTransfer, on_delete=models.CASCADE, related_name="items"
    )
    source_product = models.ForeignKey(
        Product, on_delete=models.PROTECT, related_name="transfer_source_items"
    )
    destination_product = models.ForeignKey(
        Product, on_delete=models.PROTECT, related_name="transfer_destination_items"
    )
    quantity = models.DecimalField(max_digits=18, decimal_places=3)
    received_quantity = models.DecimalField(
        max_digits=18, decimal_places=3, default=Decimal("0")
    )


class CustomerLedgerEntry(LocationOwnedModel):
    class Kind(models.TextChoices):
        DEBIT = "debit", "Debit"
        CREDIT = "credit", "Credit"

    customer = models.ForeignKey(
        Customer, on_delete=models.PROTECT, related_name="ledger_entries"
    )
    kind = models.CharField(max_length=10, choices=Kind.choices)
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    source_type = models.CharField(max_length=60)
    source_id = models.CharField(max_length=80)
    description = models.CharField(max_length=240, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("Ledger entries are immutable.")
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Ledger entries are immutable.")


class SupplierLedgerEntry(LocationOwnedModel):
    class Kind(models.TextChoices):
        DEBIT = "debit", "Debit"
        CREDIT = "credit", "Credit"

    supplier = models.ForeignKey(
        Supplier, on_delete=models.PROTECT, related_name="ledger_entries"
    )
    kind = models.CharField(max_length=10, choices=Kind.choices)
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    source_type = models.CharField(max_length=60)
    source_id = models.CharField(max_length=80)
    description = models.CharField(max_length=240, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("Ledger entries are immutable.")
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Ledger entries are immutable.")


class Expense(LocationOwnedModel):
    class Status(models.TextChoices):
        PAID = "paid", "Paid"
        PENDING = "pending", "Pending"

    title = models.CharField(max_length=180)
    category = models.CharField(max_length=100)
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    currency = models.CharField(max_length=3, default="NGN")
    incurred_at = models.DateTimeField(default=timezone.now)
    payment_method = models.CharField(
        max_length=16, choices=Payment.Method.choices
    )
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.PAID
    )
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL
    )
    custom_data = models.JSONField(default=dict, blank=True)
