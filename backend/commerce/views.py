from datetime import datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo
from uuid import UUID

from django.db import models, transaction
from django.db.models import DecimalField, F, Q, Sum, Value
from django.db.models.functions import Coalesce, TruncDay
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import OpenApiTypes, extend_schema

from audit.services import record_audit
from accounts.permissions import PlatformOwnerOnly
from config.pagination import SalePagination, TransactionPagination
from organizations.access import TenantAccessPermission, effective_capabilities
from organizations.models import Location
from organizations.tenancy import activate_organization

from .models import (
    Category,
    Customer,
    CustomerLedgerEntry,
    Expense,
    HeldCart,
    InventoryBalance,
    Product,
    PurchaseOrder,
    ReturnRecord,
    Sale,
    StockMovement,
    StockTransfer,
    Supplier,
    SupplierLedgerEntry,
)
from .serializers import (
    CategorySerializer,
    CheckoutSerializer,
    CustomerSerializer,
    ExpenseSerializer,
    HeldCartSerializer,
    ProductSerializer,
    PurchaseOrderSerializer,
    ReturnRecordSerializer,
    ReturnRequestSerializer,
    SaleSerializer,
    StockMovementSerializer,
    StockTransferSerializer,
    SupplierSerializer,
)
from .services import (
    apply_stock,
    complete_sale,
    dispatch_transfer,
    execute_idempotent,
    generate_internal_ean13,
    process_return,
    receive_purchase,
    receive_transfer,
)


MONEY_FIELD = DecimalField(max_digits=18, decimal_places=2)


def _positive_money(value):
    try:
        amount = Decimal(str(value)).quantize(Decimal("0.01"))
    except Exception as exc:
        raise ValidationError({"amount": "Enter a valid amount."}) from exc
    if amount <= 0:
        raise ValidationError({"amount": "Amount must be greater than zero."})
    return amount


class LocationContextMixin:
    organization = None
    location = None
    module_code = "commerce"

    def initial(self, request, *args, **kwargs):
        self.organization = getattr(request, "organization", None)
        if self.organization:
            activate_organization(self.organization.id)
            self.location = get_object_or_404(
                Location,
                organization=self.organization,
                id=kwargs.get("location_id"),
                is_active=True,
            )
        return super().initial(request, *args, **kwargs)


class CommerceViewSet(LocationContextMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, TenantAccessPermission]
    capability_map = {}

    def get_permissions(self):
        if getattr(self, "action", None) in self.capability_map:
            self.required_capability = self.capability_map[self.action]
        return super().get_permissions()

    def perform_create(self, serializer):
        serializer.save(organization=self.organization, location=self.location)


class CategoryViewSet(CommerceViewSet):
    serializer_class = CategorySerializer
    capability_map = {
        "create": "products.manage",
        "update": "products.manage",
        "partial_update": "products.manage",
        "destroy": "products.manage",
    }

    def get_queryset(self):
        return Category.objects.filter(
            organization=self.organization, location=self.location
        )


class ProductViewSet(CommerceViewSet):
    serializer_class = ProductSerializer
    filterset_fields = ["status", "category", "unit"]
    search_fields = ["name", "sku", "barcode"]
    ordering_fields = ["name", "sku", "selling_price", "created_at"]
    ordering = ["name", "id"]
    capability_map = {
        "create": "products.manage",
        "update": "products.manage",
        "partial_update": "products.manage",
        "destroy": "products.manage",
        "adjust_stock": "inventory.adjust",
    }

    def get_queryset(self):
        return (
            Product.objects.filter(
                organization=self.organization, location=self.location
            )
            .select_related("category", "inventory")
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        product = self.get_queryset().get(pk=serializer.instance.pk)
        response_serializer = self.get_serializer(product)
        headers = self.get_success_headers(response_serializer.data)
        return Response(
            response_serializer.data,
            status=status.HTTP_201_CREATED,
            headers=headers,
        )

    @transaction.atomic
    def perform_create(self, serializer):
        opening_quantity = serializer.validated_data.pop(
            "opening_quantity", Decimal("0")
        )
        barcode = serializer.validated_data.get("barcode", "")
        if not barcode:
            for _ in range(20):
                candidate = generate_internal_ean13()
                if not Product.objects.filter(
                    organization=self.organization,
                    location=self.location,
                    barcode=candidate,
                ).exists():
                    barcode = candidate
                    break
            if not barcode:
                raise ValidationError(
                    {"barcode": "A unique internal barcode could not be generated."}
                )
        product = serializer.save(
            organization=self.organization,
            location=self.location,
            barcode=barcode,
        )
        InventoryBalance.objects.get_or_create(
            organization=self.organization,
            location=self.location,
            product=product,
            defaults={"quantity": Decimal("0")},
        )
        if opening_quantity:
            apply_stock(
                product=product,
                delta=opening_quantity,
                kind=StockMovement.Kind.OPENING,
                actor=self.request.user,
                source_type="Product",
                source_id=product.id,
                note="Opening stock",
            )
        record_audit(
            organization=self.organization,
            location=self.location,
            actor=self.request.user,
            action="product.created",
            target=product,
            request=self.request,
        )

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        product_id = self.get_object().pk
        product = Product.objects.select_for_update().get(pk=product_id)
        serializer = self.get_serializer(product, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        target_stock = serializer.validated_data.pop("target_stock_quantity", None)
        expected_stock = serializer.validated_data.pop("expected_stock_quantity", None)

        if target_stock is not None:
            if getattr(request, "support_session", None) is None:
                capabilities = effective_capabilities(request.membership, self.location)
                if "*" not in capabilities and "inventory.adjust" not in capabilities:
                    raise PermissionDenied(
                        "Your assigned role does not allow stock adjustments."
                    )
            balance, _ = InventoryBalance.objects.select_for_update().get_or_create(
                organization=self.organization,
                location=self.location,
                product=product,
                defaults={"quantity": Decimal("0")},
            )
            if balance.quantity != expected_stock:
                raise ValidationError(
                    {
                        "expected_stock_quantity": (
                            "Quantity on hand has changed. Refresh and try again."
                        )
                    }
                )

        self.perform_update(serializer)
        record_audit(
            organization=self.organization,
            location=self.location,
            actor=request.user,
            action="product.updated",
            target=product,
            request=request,
        )
        if target_stock is not None:
            delta = target_stock - balance.quantity
            if delta:
                apply_stock(
                    product=product,
                    delta=delta,
                    kind=StockMovement.Kind.ADJUSTMENT,
                    actor=request.user,
                    source_type="ProductEdit",
                    source_id=product.id,
                    note="Product stock edited",
                )
                record_audit(
                    organization=self.organization,
                    location=self.location,
                    actor=request.user,
                    action="inventory.adjusted",
                    target=product,
                    request=request,
                    metadata={"quantity": str(delta), "reason": "Product stock edited"},
                )

        updated_product = self.get_queryset().get(pk=product.pk)
        return Response(self.get_serializer(updated_product).data)

    @action(detail=True, methods=["post"], url_path="adjust-stock")
    def adjust_stock(self, request, **kwargs):
        product = self.get_object()
        try:
            delta = Decimal(str(request.data.get("quantity")))
        except Exception as exc:
            raise ValidationError(
                {"quantity": "Enter a valid quantity adjustment."}
            ) from exc
        reason = str(request.data.get("reason", "")).strip()
        if delta == 0:
            raise ValidationError({"quantity": "Adjustment cannot be zero."})
        if not reason:
            raise ValidationError({"reason": "A reason is required."})
        movement = apply_stock(
            product=product,
            delta=delta,
            kind=StockMovement.Kind.ADJUSTMENT,
            actor=request.user,
            source_type="ManualAdjustment",
            source_id=product.id,
            note=reason,
        )
        record_audit(
            organization=self.organization,
            location=self.location,
            actor=request.user,
            action="inventory.adjusted",
            target=product,
            request=request,
            metadata={"quantity": str(delta), "reason": reason},
        )
        return Response(StockMovementSerializer(movement).data)


class CustomerViewSet(CommerceViewSet):
    permission_classes = [IsAuthenticated, PlatformOwnerOnly]
    serializer_class = CustomerSerializer
    search_fields = ["name", "phone", "email"]
    capability_map = {
        "create": "customers.manage",
        "update": "customers.manage",
        "partial_update": "customers.manage",
        "destroy": "customers.manage",
        "record_payment": "customers.manage",
    }

    def get_queryset(self):
        debits = Coalesce(
            Sum(
                "ledger_entries__amount",
                filter=Q(ledger_entries__kind=CustomerLedgerEntry.Kind.DEBIT),
            ),
            Value(Decimal("0")),
            output_field=MONEY_FIELD,
        )
        credits = Coalesce(
            Sum(
                "ledger_entries__amount",
                filter=Q(ledger_entries__kind=CustomerLedgerEntry.Kind.CREDIT),
            ),
            Value(Decimal("0")),
            output_field=MONEY_FIELD,
        )
        return Customer.objects.filter(
            organization=self.organization, location=self.location
        ).annotate(balance=debits - credits)

    @action(detail=True, methods=["post"], url_path="record-payment")
    def record_payment(self, request, **kwargs):
        customer = self.get_object()
        amount = _positive_money(request.data.get("amount"))
        idempotency_key = request.headers.get("Idempotency-Key", "").strip()

        def create_entry():
            entry = CustomerLedgerEntry.objects.create(
                organization=self.organization,
                location=self.location,
                customer=customer,
                kind=CustomerLedgerEntry.Kind.CREDIT,
                amount=amount,
                source_type="CustomerPayment",
                source_id=idempotency_key,
                description=str(request.data.get("reference", ""))[:240],
            )
            record_audit(
                organization=self.organization,
                location=self.location,
                actor=request.user,
                action="customer.payment_recorded",
                target=customer,
                request=request,
                metadata={"amount": str(amount)},
            )
            return entry

        entry, replayed = execute_idempotent(
            organization=self.organization,
            scope="commerce.customer.payment",
            key=idempotency_key,
            payload=request.data,
            model=CustomerLedgerEntry,
            callback=create_entry,
        )
        return Response(
            {
                "id": str(entry.id),
                "amount": entry.amount,
                "replayed": replayed,
            },
            status=status.HTTP_200_OK if replayed else status.HTTP_201_CREATED,
        )


class SupplierViewSet(CommerceViewSet):
    serializer_class = SupplierSerializer
    search_fields = ["name", "contact_name", "phone", "email"]
    capability_map = {
        "create": "suppliers.manage",
        "update": "suppliers.manage",
        "partial_update": "suppliers.manage",
        "destroy": "suppliers.manage",
        "record_payment": "suppliers.manage",
    }

    def get_queryset(self):
        credits = Coalesce(
            Sum(
                "ledger_entries__amount",
                filter=Q(ledger_entries__kind=SupplierLedgerEntry.Kind.CREDIT),
            ),
            Value(Decimal("0")),
            output_field=MONEY_FIELD,
        )
        debits = Coalesce(
            Sum(
                "ledger_entries__amount",
                filter=Q(ledger_entries__kind=SupplierLedgerEntry.Kind.DEBIT),
            ),
            Value(Decimal("0")),
            output_field=MONEY_FIELD,
        )
        return Supplier.objects.filter(
            organization=self.organization, location=self.location
        ).annotate(balance=credits - debits)

    @action(detail=True, methods=["post"], url_path="record-payment")
    def record_payment(self, request, **kwargs):
        supplier = self.get_object()
        amount = _positive_money(request.data.get("amount"))
        idempotency_key = request.headers.get("Idempotency-Key", "").strip()

        def create_entry():
            entry = SupplierLedgerEntry.objects.create(
                organization=self.organization,
                location=self.location,
                supplier=supplier,
                kind=SupplierLedgerEntry.Kind.DEBIT,
                amount=amount,
                source_type="SupplierPayment",
                source_id=idempotency_key,
                description=str(request.data.get("reference", ""))[:240],
            )
            record_audit(
                organization=self.organization,
                location=self.location,
                actor=request.user,
                action="supplier.payment_recorded",
                target=supplier,
                request=request,
                metadata={"amount": str(amount)},
            )
            return entry

        entry, replayed = execute_idempotent(
            organization=self.organization,
            scope="commerce.supplier.payment",
            key=idempotency_key,
            payload=request.data,
            model=SupplierLedgerEntry,
            callback=create_entry,
        )
        return Response(
            {
                "id": str(entry.id),
                "amount": entry.amount,
                "replayed": replayed,
            },
            status=status.HTTP_200_OK if replayed else status.HTTP_201_CREATED,
        )


class SaleViewSet(CommerceViewSet):
    serializer_class = SaleSerializer
    pagination_class = SalePagination
    http_method_names = ["get", "post", "head", "options"]
    search_fields = ["number", "customer_name"]
    filterset_fields = ["status", "customer", "cashier"]
    ordering_fields = ["completed_at", "total", "number"]
    capability_map = {
        "list": "sales.view",
        "retrieve": "sales.view",
        "create": "sales.checkout",
        "checkout": "sales.checkout",
        "receipt_lookup": "sales.view",
    }

    def get_queryset(self):
        return (
            Sale.objects.filter(
                organization=self.organization, location=self.location
            )
            .select_related("customer", "cashier")
            .prefetch_related("items", "payments")
        )

    def create(self, request, *args, **kwargs):
        return self.checkout(request, *args, **kwargs)

    @action(detail=False, methods=["get"], url_path="receipt-lookup")
    def receipt_lookup(self, request, **kwargs):
        value = str(request.query_params.get("qr", "")).strip()
        try:
            identifier = UUID(value)
        except ValueError as exc:
            raise ValidationError(
                {"qr": "Enter a valid receipt QR identifier."}
            ) from exc
        sale = get_object_or_404(
            self.get_queryset(),
            receipt_qr_identifier=identifier,
        )
        return Response(SaleSerializer(sale, context={"request": request}).data)

    @action(detail=False, methods=["post"], url_path="checkout")
    def checkout(self, request, **kwargs):
        idempotency_key = request.headers.get("Idempotency-Key", "").strip()
        if not idempotency_key:
            raise ValidationError(
                {"idempotency_key": "The Idempotency-Key header is required."}
            )
        if len(idempotency_key) > 100:
            raise ValidationError(
                {"idempotency_key": "Idempotency-Key is too long."}
            )
        serializer = CheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        customer = None
        if data.get("customer_id"):
            customer = get_object_or_404(
                Customer,
                id=data["customer_id"],
                organization=self.organization,
                location=self.location,
                is_active=True,
            )
        sale, replayed = complete_sale(
            organization=self.organization,
            location=self.location,
            actor=request.user,
            items=data["items"],
            payment_method=data["payment_method"],
            discount=data["discount"],
            customer=customer,
            payment_reference=data.get("payment_reference", ""),
            idempotency_key=idempotency_key,
            request=request,
        )
        sale = (
            Sale.objects.select_related("customer", "cashier")
            .prefetch_related("items", "payments")
            .get(pk=sale.pk)
        )
        payload = SaleSerializer(sale, context={"request": request}).data
        response_status = status.HTTP_200_OK if replayed else status.HTTP_201_CREATED
        response = Response(payload, status=response_status)
        response["Idempotency-Replayed"] = str(replayed).lower()
        return response


class ReturnRecordViewSet(CommerceViewSet):
    serializer_class = ReturnRecordSerializer
    pagination_class = TransactionPagination
    http_method_names = ["get", "post", "head", "options"]
    capability_map = {
        "list": "returns.view",
        "retrieve": "returns.view",
        "create": "returns.process",
    }

    def get_queryset(self):
        return (
            ReturnRecord.objects.filter(
                organization=self.organization, location=self.location
            )
            .select_related("sale", "processed_by")
            .prefetch_related("items__product")
        )

    def create(self, request, *args, **kwargs):
        idempotency_key = request.headers.get("Idempotency-Key", "").strip()
        if not idempotency_key:
            raise ValidationError(
                {"idempotency_key": "The Idempotency-Key header is required."}
            )
        serializer = ReturnRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        sale = get_object_or_404(
            Sale,
            id=data["sale_id"],
            organization=self.organization,
            location=self.location,
        )
        result, replayed = execute_idempotent(
            organization=self.organization,
            scope="commerce.return",
            key=idempotency_key,
            payload=request.data,
            model=ReturnRecord,
            callback=lambda: process_return(
                sale=sale,
                actor=request.user,
                reason=data["reason"],
                items=data["items"],
                request=request,
            ),
        )
        return Response(
            ReturnRecordSerializer(result).data,
            status=status.HTTP_200_OK if replayed else status.HTTP_201_CREATED,
        )


class PurchaseOrderViewSet(CommerceViewSet):
    permission_classes = [IsAuthenticated, PlatformOwnerOnly]
    serializer_class = PurchaseOrderSerializer
    filterset_fields = ["status", "supplier"]
    search_fields = ["number", "supplier__name"]
    capability_map = {
        "list": "purchases.view",
        "retrieve": "purchases.view",
        "create": "purchases.manage",
        "update": "purchases.manage",
        "partial_update": "purchases.manage",
        "destroy": "purchases.manage",
        "receive": "purchases.receive",
    }

    def get_queryset(self):
        return (
            PurchaseOrder.objects.filter(
                organization=self.organization, location=self.location
            )
            .select_related("supplier", "created_by")
            .prefetch_related("items__product")
        )

    @action(detail=True, methods=["post"])
    def receive(self, request, **kwargs):
        idempotency_key = request.headers.get("Idempotency-Key", "").strip()
        purchase = self.get_object()
        purchase, replayed = execute_idempotent(
            organization=self.organization,
            scope="commerce.purchase.receive",
            key=idempotency_key,
            payload={"purchase_id": str(purchase.id)},
            model=PurchaseOrder,
            callback=lambda: receive_purchase(
                purchase_order=purchase, actor=request.user, request=request
            ),
        )
        response = Response(PurchaseOrderSerializer(purchase).data)
        response["Idempotency-Replayed"] = str(replayed).lower()
        return response


class StockTransferViewSet(CommerceViewSet):
    serializer_class = StockTransferSerializer
    http_method_names = ["get", "post", "head", "options"]
    filterset_fields = ["status", "destination_location"]
    search_fields = ["number"]
    capability_map = {
        "list": "transfers.view",
        "retrieve": "transfers.view",
        "create": "transfers.manage",
        "dispatch": "transfers.manage",
        "receive": "transfers.manage",
    }

    def get_queryset(self):
        return (
            StockTransfer.objects.filter(organization=self.organization)
            .filter(
                Q(source_location=self.location)
                | Q(destination_location=self.location)
            )
            .select_related("source_location", "destination_location", "created_by")
            .prefetch_related("items__source_product", "items__destination_product")
        )

    @action(detail=True, methods=["post"])
    def dispatch(self, request, **kwargs):
        idempotency_key = request.headers.get("Idempotency-Key", "").strip()
        transfer = self.get_object()
        if transfer.source_location_id != self.location.id:
            raise ValidationError("Dispatch must be performed at the source location.")
        transfer, replayed = execute_idempotent(
            organization=self.organization,
            scope="commerce.transfer.dispatch",
            key=idempotency_key,
            payload={"transfer_id": str(transfer.id)},
            model=StockTransfer,
            callback=lambda: dispatch_transfer(
                transfer=transfer, actor=request.user, request=request
            ),
        )
        response = Response(StockTransferSerializer(transfer).data)
        response["Idempotency-Replayed"] = str(replayed).lower()
        return response

    @action(detail=True, methods=["post"])
    def receive(self, request, **kwargs):
        idempotency_key = request.headers.get("Idempotency-Key", "").strip()
        transfer = self.get_object()
        if transfer.destination_location_id != self.location.id:
            raise ValidationError(
                "Receipt must be performed at the destination location."
            )
        transfer, replayed = execute_idempotent(
            organization=self.organization,
            scope="commerce.transfer.receive",
            key=idempotency_key,
            payload={"transfer_id": str(transfer.id)},
            model=StockTransfer,
            callback=lambda: receive_transfer(
                transfer=transfer, actor=request.user, request=request
            ),
        )
        response = Response(StockTransferSerializer(transfer).data)
        response["Idempotency-Replayed"] = str(replayed).lower()
        return response


class ExpenseViewSet(CommerceViewSet):
    serializer_class = ExpenseSerializer
    filterset_fields = ["status", "category", "payment_method"]
    search_fields = ["title", "category", "notes"]
    ordering_fields = ["incurred_at", "amount", "title"]
    capability_map = {
        "list": "expenses.view",
        "retrieve": "expenses.view",
        "create": "expenses.manage",
        "update": "expenses.manage",
        "partial_update": "expenses.manage",
        "destroy": "expenses.manage",
    }

    def get_queryset(self):
        return Expense.objects.filter(
            organization=self.organization, location=self.location
        )

    def perform_create(self, serializer):
        expense = serializer.save(
            organization=self.organization,
            location=self.location,
            currency=self.organization.currency,
            created_by=self.request.user,
        )
        record_audit(
            organization=self.organization,
            location=self.location,
            actor=self.request.user,
            action="expense.created",
            target=expense,
            request=self.request,
            metadata={"amount": str(expense.amount)},
        )


class HeldCartViewSet(CommerceViewSet):
    serializer_class = HeldCartSerializer
    queryset = HeldCart.objects.none()
    capability_map = {
        "list": "sales.checkout",
        "retrieve": "sales.checkout",
        "create": "sales.checkout",
        "update": "sales.checkout",
        "partial_update": "sales.checkout",
        "destroy": "sales.checkout",
    }

    def get_queryset(self):
        return HeldCart.objects.filter(
            organization=self.organization,
            location=self.location,
            held_by=self.request.user,
        )

    def perform_create(self, serializer):
        serializer.save(
            organization=self.organization,
            location=self.location,
            held_by=self.request.user,
        )


class StockMovementViewSet(
    LocationContextMixin, viewsets.ReadOnlyModelViewSet
):
    permission_classes = [IsAuthenticated, TenantAccessPermission]
    serializer_class = StockMovementSerializer
    pagination_class = TransactionPagination
    required_capability = "inventory.view"
    filterset_fields = ["kind", "product"]
    ordering_fields = ["created_at"]

    def get_queryset(self):
        return StockMovement.objects.filter(
            organization=self.organization, location=self.location
        ).select_related("product", "actor")


class DashboardView(LocationContextMixin, APIView):
    permission_classes = [IsAuthenticated, TenantAccessPermission]
    required_capability = "dashboard.view"

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request, **kwargs):
        now = timezone.now()
        tenant_timezone = ZoneInfo(self.organization.timezone)
        local_now = now.astimezone(tenant_timezone)
        today = local_now.date()
        today_start = datetime.combine(today, time.min, tzinfo=tenant_timezone)
        tomorrow_start = today_start + timedelta(days=1)
        month_start_date = today.replace(day=1)
        month_start = datetime.combine(
            month_start_date, time.min, tzinfo=tenant_timezone
        )
        sales = Sale.objects.filter(
            organization=self.organization,
            location=self.location,
            status__in=[
                Sale.Status.COMPLETED,
                Sale.Status.PARTIALLY_RETURNED,
                Sale.Status.REFUNDED,
            ],
        )
        today_sales = sales.filter(
            completed_at__gte=today_start,
            completed_at__lt=tomorrow_start,
        ).aggregate(
            total=Coalesce(Sum("total"), Value(Decimal("0")), output_field=MONEY_FIELD),
            transactions=models.Count("id"),
        )
        month_sales = sales.filter(completed_at__gte=month_start).aggregate(
            total=Coalesce(Sum("total"), Value(Decimal("0")), output_field=MONEY_FIELD)
        )["total"]
        inventory = InventoryBalance.objects.filter(
            organization=self.organization, location=self.location
        ).aggregate(
            value=Coalesce(
                Sum(F("quantity") * F("product__cost_price")),
                Value(Decimal("0")),
                output_field=MONEY_FIELD,
            ),
            units=Coalesce(
                Sum("quantity"),
                Value(Decimal("0")),
                output_field=DecimalField(max_digits=18, decimal_places=3),
            ),
        )
        active_products = Product.objects.filter(
            organization=self.organization,
            location=self.location,
            status=Product.Status.ACTIVE,
        )
        low_stock = (
            active_products.filter(inventory__quantity__lte=F("reorder_level"))
            .select_related("inventory")
            .order_by("inventory__quantity")[:8]
        )
        period_start = min(month_start, now - timedelta(days=29))
        trend = (
            sales.filter(completed_at__gte=period_start)
            .annotate(day=TruncDay("completed_at", tzinfo=tenant_timezone))
            .values("day")
            .annotate(
                sales=Coalesce(
                    Sum("total"), Value(Decimal("0")), output_field=MONEY_FIELD
                ),
                transactions=models.Count("id"),
            )
            .order_by("day")
        )
        expense_total = Expense.objects.filter(
            organization=self.organization,
            location=self.location,
            incurred_at__gte=month_start,
        ).aggregate(
            total=Coalesce(Sum("amount"), Value(Decimal("0")), output_field=MONEY_FIELD)
        )["total"]
        customer_debits = CustomerLedgerEntry.objects.filter(
            organization=self.organization,
            location=self.location,
            kind=CustomerLedgerEntry.Kind.DEBIT,
        ).aggregate(
            total=Coalesce(Sum("amount"), Value(Decimal("0")), output_field=MONEY_FIELD)
        )["total"]
        customer_credits = CustomerLedgerEntry.objects.filter(
            organization=self.organization,
            location=self.location,
            kind=CustomerLedgerEntry.Kind.CREDIT,
        ).aggregate(
            total=Coalesce(Sum("amount"), Value(Decimal("0")), output_field=MONEY_FIELD)
        )["total"]
        supplier_credits = SupplierLedgerEntry.objects.filter(
            organization=self.organization,
            location=self.location,
            kind=SupplierLedgerEntry.Kind.CREDIT,
        ).aggregate(
            total=Coalesce(Sum("amount"), Value(Decimal("0")), output_field=MONEY_FIELD)
        )["total"]
        supplier_debits = SupplierLedgerEntry.objects.filter(
            organization=self.organization,
            location=self.location,
            kind=SupplierLedgerEntry.Kind.DEBIT,
        ).aggregate(
            total=Coalesce(Sum("amount"), Value(Decimal("0")), output_field=MONEY_FIELD)
        )["total"]
        supplier_payments = SupplierLedgerEntry.objects.filter(
            organization=self.organization,
            location=self.location,
            kind=SupplierLedgerEntry.Kind.DEBIT,
            created_at__gte=month_start,
        ).aggregate(
            total=Coalesce(Sum("amount"), Value(Decimal("0")), output_field=MONEY_FIELD)
        )["total"]
        return Response(
            {
                "generated_at": now,
                "currency": self.organization.currency,
                "metrics": {
                    "inventory_value": inventory["value"],
                    "inventory_units": inventory["units"],
                    "today_sales": today_sales["total"],
                    "today_transactions": today_sales["transactions"],
                    "monthly_sales": month_sales,
                    "total_products": active_products.count(),
                    "monthly_expenses": expense_total,
                    "customer_debts": customer_debits - customer_credits,
                    "supplier_balance": supplier_credits - supplier_debits,
                    "supplier_payments": supplier_payments,
                },
                "sales_trend": list(trend),
                "recent_transactions": SaleSerializer(
                    sales.select_related("cashier", "customer").prefetch_related(
                        "items", "payments"
                    )[:8],
                    many=True,
                ).data,
                "stock_alerts": ProductSerializer(low_stock, many=True).data,
            }
        )


class ReportsView(DashboardView):
    required_capability = "reports.view"
