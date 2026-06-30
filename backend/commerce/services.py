import hashlib
import json
from decimal import Decimal

from django.db import IntegrityError, connection, transaction
from django.db.models import Sum
from django.utils import timezone

from audit.models import IdempotencyRecord
from audit.services import publish_later, record_audit
from notifications.models import Notification
from notifications.services import notify_organization

from .exceptions import ConflictError, IdempotencyConflict, InsufficientStock
from .models import (
    CustomerLedgerEntry,
    DocumentSequence,
    InventoryBalance,
    Payment,
    Product,
    PurchaseOrder,
    ReturnItem,
    ReturnRecord,
    Sale,
    SaleItem,
    StockMovement,
    StockTransfer,
    SupplierLedgerEntry,
    TransferItem,
)


def _decimal(value, places="0.001"):
    return Decimal(str(value)).quantize(Decimal(places))


def payload_hash(payload):
    normalized = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(normalized.encode()).hexdigest()


def lock_idempotency_key(*, organization, scope, key):
    if connection.vendor != "postgresql":
        return
    digest = hashlib.sha256(
        f"{organization.id}:{scope}:{key}".encode()
    ).digest()[:8]
    lock_id = int.from_bytes(digest, byteorder="big", signed=True)
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_advisory_xact_lock(%s)", [lock_id])


@transaction.atomic
def execute_idempotent(
    *,
    organization,
    scope,
    key,
    payload,
    model,
    callback,
):
    if not key:
        raise ConflictError("The Idempotency-Key header is required.")
    digest = payload_hash(payload)
    lock_idempotency_key(
        organization=organization,
        scope=scope,
        key=key,
    )
    existing = IdempotencyRecord.objects.filter(
        organization=organization, scope=scope, key=key
    ).first()
    if existing:
        if existing.request_hash != digest:
            raise IdempotencyConflict()
        return model.objects.get(pk=existing.resource_id), True
    result = callback()
    IdempotencyRecord.objects.create(
        organization=organization,
        scope=scope,
        key=key,
        request_hash=digest,
        response_code=201,
        response_body={"id": str(result.id)},
        resource_type=model.__name__,
        resource_id=str(result.id),
    )
    return result, False


def next_document_number(*, organization, location, document_type, prefix):
    try:
        sequence, _ = DocumentSequence.objects.select_for_update().get_or_create(
            organization=organization,
            location=location,
            document_type=document_type,
            defaults={"prefix": prefix, "next_number": 1},
        )
    except IntegrityError:
        sequence = DocumentSequence.objects.select_for_update().get(
            organization=organization,
            location=location,
            document_type=document_type,
        )
    value = f"{sequence.prefix}-{sequence.next_number:06d}"
    sequence.next_number += 1
    sequence.save(update_fields=["next_number", "updated_at"])
    return value


def apply_stock(
    *,
    product,
    delta,
    kind,
    actor=None,
    source_type="",
    source_id="",
    note="",
):
    delta = _decimal(delta)
    balance, _ = InventoryBalance.objects.select_for_update().get_or_create(
        organization=product.organization,
        location=product.location,
        product=product,
        defaults={"quantity": Decimal("0")},
    )
    new_quantity = balance.quantity + delta
    if new_quantity < 0:
        raise InsufficientStock(
            f"{product.name} has {balance.quantity} {product.unit} available."
        )
    balance.quantity = new_quantity
    balance.save(update_fields=["quantity", "updated_at"])
    return StockMovement.objects.create(
        organization=product.organization,
        location=product.location,
        product=product,
        kind=kind,
        quantity=delta,
        balance_after=new_quantity,
        source_type=source_type,
        source_id=str(source_id),
        note=note,
        actor=actor,
    )


@transaction.atomic
def complete_sale(
    *,
    organization,
    location,
    actor,
    items,
    payment_method,
    discount=0,
    customer=None,
    payment_reference="",
    idempotency_key,
    request=None,
):
    request_payload = {
        "location": str(location.id),
        "items": items,
        "payment_method": payment_method,
        "discount": str(discount),
        "customer": str(customer.id) if customer else None,
        "payment_reference": payment_reference,
    }
    digest = payload_hash(request_payload)
    lock_idempotency_key(
        organization=organization,
        scope="commerce.checkout",
        key=idempotency_key,
    )
    existing = IdempotencyRecord.objects.filter(
        organization=organization,
        scope="commerce.checkout",
        key=idempotency_key,
    ).first()
    if existing:
        if existing.request_hash != digest:
            raise IdempotencyConflict()
        return Sale.objects.get(pk=existing.resource_id), True

    if not items:
        raise ConflictError("A sale must contain at least one item.")
    if customer and (
        customer.organization_id != organization.id
        or customer.location_id != location.id
    ):
        raise ConflictError("Customer does not belong to this location.")

    product_ids = [item["product_id"] for item in items]
    products = {
        str(product.id): product
        for product in Product.objects.select_for_update().filter(
            organization=organization,
            location=location,
            id__in=product_ids,
            status=Product.Status.ACTIVE,
        ).order_by("id")
    }
    if len(products) != len(set(map(str, product_ids))):
        raise ConflictError("One or more products are unavailable at this location.")

    normalized_items = []
    subtotal = Decimal("0")
    for item in items:
        product = products[str(item["product_id"])]
        quantity = _decimal(item["quantity"])
        if quantity <= 0:
            raise ConflictError("Sale quantities must be greater than zero.")
        line_total = (product.selling_price * quantity).quantize(Decimal("0.01"))
        subtotal += line_total
        normalized_items.append((product, quantity, line_total))

    discount = _decimal(discount, "0.01")
    if discount < 0 or discount > subtotal:
        raise ConflictError("Discount must be between zero and the subtotal.")
    total = subtotal - discount
    number = next_document_number(
        organization=organization,
        location=location,
        document_type="sale",
        prefix="SALE",
    )
    sale = Sale.objects.create(
        organization=organization,
        location=location,
        number=number,
        customer=customer,
        customer_name=customer.name if customer else "Walk-in customer",
        subtotal=subtotal,
        discount=discount,
        total=total,
        currency=organization.currency,
        cashier=actor,
        status=Sale.Status.COMPLETED,
    )

    low_stock_products = []
    for product, quantity, line_total in normalized_items:
        SaleItem.objects.create(
            organization=organization,
            location=location,
            sale=sale,
            product=product,
            product_name=product.name,
            sku=product.sku,
            unit=product.unit,
            quantity=quantity,
            unit_price=product.selling_price,
            unit_cost=product.cost_price,
            line_total=line_total,
        )
        movement = apply_stock(
            product=product,
            delta=-quantity,
            kind=StockMovement.Kind.SALE,
            actor=actor,
            source_type="Sale",
            source_id=sale.id,
        )
        if movement.balance_after <= product.reorder_level:
            low_stock_products.append(product.name)

    payment = Payment.objects.create(
        organization=organization,
        location=location,
        sale=sale,
        method=payment_method,
        amount=total,
        status=Payment.Status.CONFIRMED,
        reference=payment_reference,
    )
    if customer:
        CustomerLedgerEntry.objects.create(
            organization=organization,
            location=location,
            customer=customer,
            kind=CustomerLedgerEntry.Kind.DEBIT,
            amount=total,
            source_type="Sale",
            source_id=str(sale.id),
            description=number,
        )
        CustomerLedgerEntry.objects.create(
            organization=organization,
            location=location,
            customer=customer,
            kind=CustomerLedgerEntry.Kind.CREDIT,
            amount=payment.amount,
            source_type="Payment",
            source_id=str(payment.id),
            description=f"Payment for {number}",
        )

    IdempotencyRecord.objects.create(
        organization=organization,
        scope="commerce.checkout",
        key=idempotency_key,
        request_hash=digest,
        response_code=201,
        response_body={"id": str(sale.id), "number": sale.number},
        resource_type="Sale",
        resource_id=str(sale.id),
    )
    record_audit(
        organization=organization,
        location=location,
        actor=actor,
        action="sale.completed",
        target=sale,
        request=request,
        metadata={"total": str(total), "items": len(items)},
    )
    publish_later(
        organization=organization,
        topic="sale.completed",
        payload={"sale_id": str(sale.id), "location_id": str(location.id)},
    )
    if low_stock_products:
        notify_organization(
            organization=organization,
            location=location,
            title="Stock is running low",
            body=", ".join(low_stock_products),
            tone=Notification.Tone.WARNING,
            href="/products",
            module_code="commerce",
            created_by=actor,
        )
    return sale, False


@transaction.atomic
def receive_purchase(*, purchase_order, actor, request=None):
    purchase_order = (
        PurchaseOrder.objects.select_for_update()
        .select_related("organization", "location", "supplier")
        .get(pk=purchase_order.pk)
    )
    if purchase_order.status == PurchaseOrder.Status.RECEIVED:
        return purchase_order
    if purchase_order.status != PurchaseOrder.Status.ORDERED:
        raise ConflictError("Only ordered purchase orders can be received.")

    for item in purchase_order.items.select_related("product"):
        apply_stock(
            product=item.product,
            delta=item.quantity,
            kind=StockMovement.Kind.PURCHASE,
            actor=actor,
            source_type="PurchaseOrder",
            source_id=purchase_order.id,
        )
    SupplierLedgerEntry.objects.create(
        organization=purchase_order.organization,
        location=purchase_order.location,
        supplier=purchase_order.supplier,
        kind=SupplierLedgerEntry.Kind.CREDIT,
        amount=purchase_order.total,
        source_type="PurchaseOrder",
        source_id=str(purchase_order.id),
        description=purchase_order.number,
    )
    purchase_order.status = PurchaseOrder.Status.RECEIVED
    purchase_order.received_at = timezone.now()
    purchase_order.save(update_fields=["status", "received_at", "updated_at"])
    record_audit(
        organization=purchase_order.organization,
        location=purchase_order.location,
        actor=actor,
        action="purchase.received",
        target=purchase_order,
        request=request,
    )
    return purchase_order


@transaction.atomic
def process_return(*, sale, actor, reason, items, request=None):
    sale = Sale.objects.select_for_update().get(pk=sale.pk)
    if sale.status in {Sale.Status.VOID, Sale.Status.REFUNDED}:
        raise ConflictError("This sale can no longer accept returns.")

    number = next_document_number(
        organization=sale.organization,
        location=sale.location,
        document_type="return",
        prefix="RET",
    )
    return_record = ReturnRecord.objects.create(
        organization=sale.organization,
        location=sale.location,
        number=number,
        sale=sale,
        reason=reason,
        total=Decimal("0"),
        processed_by=actor,
    )
    total = Decimal("0")
    for requested in items:
        sale_item = SaleItem.objects.select_related("product").get(
            pk=requested["sale_item_id"], sale=sale
        )
        quantity = _decimal(requested["quantity"])
        already_returned = (
            ReturnItem.objects.filter(
                sale_item=sale_item,
                return_record__status=ReturnRecord.Status.APPROVED,
            ).aggregate(total=Sum("quantity"))["total"]
            or Decimal("0")
        )
        if quantity <= 0 or already_returned + quantity > sale_item.quantity:
            raise ConflictError(f"Invalid return quantity for {sale_item.product_name}.")
        line_total = (sale_item.unit_price * quantity).quantize(Decimal("0.01"))
        ReturnItem.objects.create(
            organization=sale.organization,
            location=sale.location,
            return_record=return_record,
            sale_item=sale_item,
            product=sale_item.product,
            quantity=quantity,
            unit_amount=sale_item.unit_price,
            line_total=line_total,
        )
        apply_stock(
            product=sale_item.product,
            delta=quantity,
            kind=StockMovement.Kind.RETURN,
            actor=actor,
            source_type="ReturnRecord",
            source_id=return_record.id,
        )
        total += line_total

    return_record.total = total
    return_record.save(update_fields=["total", "updated_at"])
    if sale.customer:
        CustomerLedgerEntry.objects.create(
            organization=sale.organization,
            location=sale.location,
            customer=sale.customer,
            kind=CustomerLedgerEntry.Kind.CREDIT,
            amount=total,
            source_type="ReturnRecord",
            source_id=str(return_record.id),
            description=number,
        )
    returned_total = (
        ReturnRecord.objects.filter(sale=sale, status=ReturnRecord.Status.APPROVED)
        .aggregate(total=Sum("total"))["total"]
        or Decimal("0")
    )
    sale.status = (
        Sale.Status.REFUNDED
        if returned_total >= sale.total
        else Sale.Status.PARTIALLY_RETURNED
    )
    sale.save(update_fields=["status", "updated_at"])
    record_audit(
        organization=sale.organization,
        location=sale.location,
        actor=actor,
        action="sale.returned",
        target=return_record,
        request=request,
        metadata={"total": str(total)},
    )
    return return_record


@transaction.atomic
def dispatch_transfer(*, transfer, actor, request=None):
    transfer = StockTransfer.objects.select_for_update().get(pk=transfer.pk)
    if transfer.status != StockTransfer.Status.DRAFT:
        raise ConflictError("Only draft transfers can be dispatched.")
    for item in transfer.items.select_related("source_product"):
        apply_stock(
            product=item.source_product,
            delta=-item.quantity,
            kind=StockMovement.Kind.TRANSFER_OUT,
            actor=actor,
            source_type="StockTransfer",
            source_id=transfer.id,
        )
    transfer.status = StockTransfer.Status.DISPATCHED
    transfer.dispatched_at = timezone.now()
    transfer.save(update_fields=["status", "dispatched_at", "updated_at"])
    record_audit(
        organization=transfer.organization,
        location=transfer.source_location,
        actor=actor,
        action="transfer.dispatched",
        target=transfer,
        request=request,
    )
    return transfer


@transaction.atomic
def receive_transfer(*, transfer, actor, request=None):
    transfer = StockTransfer.objects.select_for_update().get(pk=transfer.pk)
    if transfer.status != StockTransfer.Status.DISPATCHED:
        raise ConflictError("Only dispatched transfers can be received.")
    for item in transfer.items.select_related("destination_product"):
        apply_stock(
            product=item.destination_product,
            delta=item.quantity,
            kind=StockMovement.Kind.TRANSFER_IN,
            actor=actor,
            source_type="StockTransfer",
            source_id=transfer.id,
        )
        item.received_quantity = item.quantity
        item.save(update_fields=["received_quantity", "updated_at"])
    transfer.status = StockTransfer.Status.RECEIVED
    transfer.received_at = timezone.now()
    transfer.save(update_fields=["status", "received_at", "updated_at"])
    record_audit(
        organization=transfer.organization,
        location=transfer.destination_location,
        actor=actor,
        action="transfer.received",
        target=transfer,
        request=request,
    )
    return transfer
