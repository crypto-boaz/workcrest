from decimal import Decimal

from django.db import models, transaction
from django.db.models import DecimalField, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework import serializers

from organizations.models import Location
from organizations.custom_fields import validate_custom_data

from .models import (
    Category,
    Customer,
    Expense,
    HeldCart,
    InventoryBalance,
    Payment,
    Product,
    PurchaseItem,
    PurchaseOrder,
    ReturnItem,
    ReturnRecord,
    Sale,
    SaleItem,
    StockMovement,
    StockTransfer,
    Supplier,
    TransferItem,
)
from .services import next_document_number


MONEY_FIELD = DecimalField(max_digits=18, decimal_places=2)


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class ProductSerializer(serializers.ModelSerializer):
    stock_quantity = serializers.DecimalField(
        max_digits=18, decimal_places=3, read_only=True, source="inventory.quantity"
    )
    opening_quantity = serializers.DecimalField(
        max_digits=18,
        decimal_places=3,
        min_value=Decimal("0"),
        write_only=True,
        required=False,
        default=Decimal("0"),
    )
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "sku",
            "barcode",
            "qr_identifier",
            "category",
            "category_name",
            "unit",
            "selling_price",
            "cost_price",
            "reorder_level",
            "stock_quantity",
            "opening_quantity",
            "status",
            "custom_data",
            "version",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "qr_identifier",
            "version",
            "created_at",
            "updated_at",
        ]

    def validate_barcode(self, value):
        value = value.strip()
        if not value:
            return ""
        view = self.context["view"]
        products = Product.objects.filter(
            organization=view.organization,
            location=view.location,
            barcode=value,
        )
        if self.instance is not None:
            products = products.exclude(id=self.instance.id)
        if products.exists():
            raise serializers.ValidationError(
                "This barcode is already assigned to another product."
            )
        return value

    def validate_category(self, value):
        view = self.context["view"]
        if value and (
            value.organization_id != view.organization.id
            or value.location_id != view.location.id
        ):
            raise serializers.ValidationError(
                "Category does not belong to this location."
            )
        return value

    def validate_custom_data(self, value):
        return validate_custom_data(
            organization=self.context["view"].organization,
            module_code="commerce",
            entity_type="product",
            values=value,
        )

    def validate(self, attrs):
        if self.instance is None or "custom_data" in attrs:
            attrs["custom_data"] = self.validate_custom_data(
                attrs.get("custom_data", {})
            )
        return attrs

    def update(self, instance, validated_data):
        validated_data.pop("opening_quantity", None)
        supplied_version = self.initial_data.get("version")
        if supplied_version is not None and int(supplied_version) != instance.version:
            raise serializers.ValidationError(
                {"version": "This product has changed. Refresh and try again."}
            )
        validated_data["version"] = instance.version + 1
        return super().update(instance, validated_data)


class CustomerSerializer(serializers.ModelSerializer):
    balance = serializers.DecimalField(
        max_digits=18, decimal_places=2, read_only=True
    )

    class Meta:
        model = Customer
        fields = [
            "id",
            "name",
            "phone",
            "email",
            "custom_data",
            "is_active",
            "balance",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "balance", "created_at", "updated_at"]

    def validate_custom_data(self, value):
        return validate_custom_data(
            organization=self.context["view"].organization,
            module_code="commerce",
            entity_type="customer",
            values=value,
        )

    def validate(self, attrs):
        if self.instance is None or "custom_data" in attrs:
            attrs["custom_data"] = self.validate_custom_data(
                attrs.get("custom_data", {})
            )
        return attrs


class SupplierSerializer(serializers.ModelSerializer):
    balance = serializers.DecimalField(
        max_digits=18, decimal_places=2, read_only=True
    )

    class Meta:
        model = Supplier
        fields = [
            "id",
            "name",
            "contact_name",
            "phone",
            "email",
            "custom_data",
            "is_active",
            "balance",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "balance", "created_at", "updated_at"]

    def validate_custom_data(self, value):
        return validate_custom_data(
            organization=self.context["view"].organization,
            module_code="commerce",
            entity_type="supplier",
            values=value,
        )

    def validate(self, attrs):
        if self.instance is None or "custom_data" in attrs:
            attrs["custom_data"] = self.validate_custom_data(
                attrs.get("custom_data", {})
            )
        return attrs


class SaleItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaleItem
        fields = [
            "id",
            "product",
            "product_name",
            "sku",
            "barcode",
            "product_qr_identifier",
            "unit",
            "quantity",
            "unit_price",
            "unit_cost",
            "line_total",
        ]


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = [
            "id",
            "method",
            "amount",
            "status",
            "reference",
            "received_at",
        ]


class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)
    cashier_name = serializers.CharField(source="cashier.get_full_name", read_only=True)

    class Meta:
        model = Sale
        fields = [
            "id",
            "number",
            "receipt_qr_identifier",
            "customer",
            "customer_name",
            "status",
            "subtotal",
            "discount",
            "total",
            "currency",
            "cashier",
            "cashier_name",
            "completed_at",
            "items",
            "payments",
            "created_at",
        ]
        read_only_fields = ["receipt_qr_identifier"]


class CheckoutItemSerializer(serializers.Serializer):
    product_id = serializers.UUIDField()
    quantity = serializers.DecimalField(
        max_digits=18, decimal_places=3, min_value=Decimal("0.001")
    )


class CheckoutSerializer(serializers.Serializer):
    items = CheckoutItemSerializer(many=True, allow_empty=False)
    customer_id = serializers.UUIDField(required=False, allow_null=True)
    payment_method = serializers.ChoiceField(choices=Payment.Method.choices)
    payment_reference = serializers.CharField(
        max_length=100, required=False, allow_blank=True
    )
    discount = serializers.DecimalField(
        max_digits=18,
        decimal_places=2,
        min_value=Decimal("0"),
        required=False,
        default=Decimal("0"),
    )


class ReturnRequestItemSerializer(serializers.Serializer):
    sale_item_id = serializers.UUIDField()
    quantity = serializers.DecimalField(
        max_digits=18, decimal_places=3, min_value=Decimal("0.001")
    )


class ReturnRequestSerializer(serializers.Serializer):
    sale_id = serializers.UUIDField()
    reason = serializers.CharField(max_length=240)
    items = ReturnRequestItemSerializer(many=True, allow_empty=False)


class ReturnItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = ReturnItem
        fields = [
            "id",
            "sale_item",
            "product",
            "product_name",
            "quantity",
            "unit_amount",
            "line_total",
        ]


class ReturnRecordSerializer(serializers.ModelSerializer):
    items = ReturnItemSerializer(many=True, read_only=True)
    sale_number = serializers.CharField(source="sale.number", read_only=True)

    class Meta:
        model = ReturnRecord
        fields = [
            "id",
            "number",
            "sale",
            "sale_number",
            "status",
            "reason",
            "total",
            "processed_by",
            "items",
            "created_at",
        ]


class PurchaseItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = PurchaseItem
        fields = [
            "id",
            "product",
            "product_name",
            "quantity",
            "unit_cost",
            "line_total",
        ]
        read_only_fields = ["id", "product_name", "line_total"]


class PurchaseOrderSerializer(serializers.ModelSerializer):
    items = PurchaseItemSerializer(many=True)
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = [
            "id",
            "number",
            "supplier",
            "supplier_name",
            "status",
            "expected_at",
            "total",
            "created_by",
            "received_at",
            "items",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "number",
            "status",
            "total",
            "created_by",
            "received_at",
            "created_at",
            "updated_at",
        ]

    def validate_supplier(self, value):
        view = self.context["view"]
        if (
            value.organization_id != view.organization.id
            or value.location_id != view.location.id
        ):
            raise serializers.ValidationError(
                "Supplier does not belong to this location."
            )
        return value

    def validate_items(self, items):
        view = self.context["view"]
        if not items:
            raise serializers.ValidationError("Add at least one purchase item.")
        for item in items:
            product = item["product"]
            if (
                product.organization_id != view.organization.id
                or product.location_id != view.location.id
            ):
                raise serializers.ValidationError(
                    "Every product must belong to this location."
                )
            if item["quantity"] <= 0 or item["unit_cost"] < 0:
                raise serializers.ValidationError(
                    "Quantities must be positive and costs cannot be negative."
                )
        return items

    @transaction.atomic
    def create(self, validated_data):
        items = validated_data.pop("items")
        view = self.context["view"]
        purchase = PurchaseOrder.objects.create(
            organization=view.organization,
            location=view.location,
            number=next_document_number(
                organization=view.organization,
                location=view.location,
                document_type="purchase",
                prefix="PO",
            ),
            created_by=self.context["request"].user,
            **validated_data,
        )
        total = Decimal("0")
        for item in items:
            line_total = (item["quantity"] * item["unit_cost"]).quantize(
                Decimal("0.01")
            )
            PurchaseItem.objects.create(
                organization=view.organization,
                location=view.location,
                purchase_order=purchase,
                line_total=line_total,
                **item,
            )
            total += line_total
        purchase.total = total
        purchase.save(update_fields=["total", "updated_at"])
        return purchase


class TransferItemSerializer(serializers.ModelSerializer):
    source_product_name = serializers.CharField(
        source="source_product.name", read_only=True
    )
    destination_product_name = serializers.CharField(
        source="destination_product.name", read_only=True
    )

    class Meta:
        model = TransferItem
        fields = [
            "id",
            "source_product",
            "source_product_name",
            "destination_product",
            "destination_product_name",
            "quantity",
            "received_quantity",
        ]
        read_only_fields = ["id", "received_quantity"]


class StockTransferSerializer(serializers.ModelSerializer):
    items = TransferItemSerializer(many=True)
    source_location_name = serializers.CharField(
        source="source_location.name", read_only=True
    )
    destination_location_name = serializers.CharField(
        source="destination_location.name", read_only=True
    )

    class Meta:
        model = StockTransfer
        fields = [
            "id",
            "number",
            "source_location",
            "source_location_name",
            "destination_location",
            "destination_location_name",
            "status",
            "note",
            "created_by",
            "dispatched_at",
            "received_at",
            "items",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "number",
            "source_location",
            "status",
            "created_by",
            "dispatched_at",
            "received_at",
            "created_at",
            "updated_at",
        ]

    def validate_destination_location(self, value):
        view = self.context["view"]
        if value.organization_id != view.organization.id:
            raise serializers.ValidationError(
                "Destination must belong to this organization."
            )
        if value.id == view.location.id:
            raise serializers.ValidationError("Choose a different destination.")
        return value

    def validate_items(self, items):
        view = self.context["view"]
        if not items:
            raise serializers.ValidationError("Add at least one transfer item.")
        destination_id = str(self.initial_data.get("destination_location"))
        for item in items:
            source = item["source_product"]
            destination = item["destination_product"]
            if (
                source.organization_id != view.organization.id
                or source.location_id != view.location.id
            ):
                raise serializers.ValidationError(
                    "Source products must belong to the source location."
                )
            if (
                destination.organization_id != view.organization.id
                or str(destination.location_id) != destination_id
            ):
                raise serializers.ValidationError(
                    "Destination products must be mapped at the destination location."
                )
            if source.unit != destination.unit:
                raise serializers.ValidationError(
                    "Mapped source and destination products must use the same unit."
                )
        return items

    @transaction.atomic
    def create(self, validated_data):
        items = validated_data.pop("items")
        view = self.context["view"]
        transfer = StockTransfer.objects.create(
            organization=view.organization,
            source_location=view.location,
            number=next_document_number(
                organization=view.organization,
                location=view.location,
                document_type="transfer",
                prefix="TRF",
            ),
            created_by=self.context["request"].user,
            **validated_data,
        )
        TransferItem.objects.bulk_create(
            [
                TransferItem(
                    organization=view.organization,
                    transfer=transfer,
                    **item,
                )
                for item in items
            ]
        )
        return transfer


class ExpenseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Expense
        fields = [
            "id",
            "title",
            "category",
            "amount",
            "currency",
            "incurred_at",
            "payment_method",
            "status",
            "notes",
            "created_by",
            "custom_data",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "currency",
            "created_by",
            "created_at",
            "updated_at",
        ]

    def validate_custom_data(self, value):
        return validate_custom_data(
            organization=self.context["view"].organization,
            module_code="commerce",
            entity_type="expense",
            values=value,
        )

    def validate(self, attrs):
        if self.instance is None or "custom_data" in attrs:
            attrs["custom_data"] = self.validate_custom_data(
                attrs.get("custom_data", {})
            )
        return attrs


class HeldCartSerializer(serializers.ModelSerializer):
    class Meta:
        model = HeldCart
        fields = [
            "id",
            "customer",
            "items",
            "discount",
            "held_by",
            "expires_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "held_by", "created_at", "updated_at"]

    def validate_customer(self, value):
        if not value:
            return value
        view = self.context["view"]
        if (
            value.organization_id != view.organization.id
            or value.location_id != view.location.id
        ):
            raise serializers.ValidationError(
                "Customer does not belong to this location."
            )
        return value


class StockMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = StockMovement
        fields = [
            "id",
            "product",
            "product_name",
            "kind",
            "quantity",
            "balance_after",
            "source_type",
            "source_id",
            "note",
            "actor",
            "created_at",
        ]


def customer_queryset_with_balance(queryset):
    return queryset.annotate(
        debit_total=Coalesce(
            Sum("ledger_entries__amount", filter=models.Q(ledger_entries__kind="debit")),
            Value(Decimal("0")),
            output_field=MONEY_FIELD,
        ),
        credit_total=Coalesce(
            Sum(
                "ledger_entries__amount",
                filter=models.Q(ledger_entries__kind="credit"),
            ),
            Value(Decimal("0")),
            output_field=MONEY_FIELD,
        ),
    ).annotate(balance=models.F("debit_total") - models.F("credit_total"))
