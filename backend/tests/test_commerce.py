from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from commerce.exceptions import IdempotencyConflict, InsufficientStock
from commerce.models import (
    InventoryBalance,
    Payment,
    Product,
    StockMovement,
    StockTransfer,
    TransferItem,
)
from commerce.services import (
    apply_stock,
    complete_sale,
    dispatch_transfer,
    receive_transfer,
)
from organizations.models import Location


pytestmark = pytest.mark.django_db


def stocked_product(tenant_pair, quantity="5"):
    product = Product.objects.create(
        organization=tenant_pair.organization_a,
        location=tenant_pair.location_a,
        name="Stocked Product",
        sku="STOCK-001",
        barcode="0123456789012",
        selling_price=Decimal("1500"),
        cost_price=Decimal("900"),
        reorder_level=Decimal("1"),
    )
    apply_stock(
        product=product,
        delta=Decimal(quantity),
        kind=StockMovement.Kind.OPENING,
        actor=tenant_pair.owner_a,
    )
    return product


def test_checkout_retry_returns_exactly_one_sale_and_one_stock_deduction(
    tenant_pair,
):
    product = stocked_product(tenant_pair)
    payload = [{"product_id": str(product.id), "quantity": "2"}]
    first, replayed_first = complete_sale(
        organization=tenant_pair.organization_a,
        location=tenant_pair.location_a,
        actor=tenant_pair.owner_a,
        items=payload,
        payment_method=Payment.Method.CASH,
        idempotency_key="checkout-retry-1",
    )
    second, replayed_second = complete_sale(
        organization=tenant_pair.organization_a,
        location=tenant_pair.location_a,
        actor=tenant_pair.owner_a,
        items=payload,
        payment_method=Payment.Method.CASH,
        idempotency_key="checkout-retry-1",
    )
    balance = InventoryBalance.objects.get(product=product)

    assert first.id == second.id
    assert replayed_first is False
    assert replayed_second is True
    assert balance.quantity == Decimal("3")
    assert product.stock_movements.filter(kind=StockMovement.Kind.SALE).count() == 1
    assert first.receipt_qr_identifier is not None
    sale_item = first.items.get()
    assert sale_item.product_qr_identifier == product.qr_identifier
    assert sale_item.barcode == product.barcode


def test_reusing_idempotency_key_with_changed_payload_conflicts(tenant_pair):
    product = stocked_product(tenant_pair)
    complete_sale(
        organization=tenant_pair.organization_a,
        location=tenant_pair.location_a,
        actor=tenant_pair.owner_a,
        items=[{"product_id": str(product.id), "quantity": "1"}],
        payment_method=Payment.Method.CASH,
        idempotency_key="checkout-conflict",
    )
    with pytest.raises(IdempotencyConflict):
        complete_sale(
            organization=tenant_pair.organization_a,
            location=tenant_pair.location_a,
            actor=tenant_pair.owner_a,
            items=[{"product_id": str(product.id), "quantity": "2"}],
            payment_method=Payment.Method.CASH,
            idempotency_key="checkout-conflict",
        )


def test_receipt_qr_lookup_returns_immutable_product_snapshot(tenant_pair):
    product = stocked_product(tenant_pair)
    sale, _ = complete_sale(
        organization=tenant_pair.organization_a,
        location=tenant_pair.location_a,
        actor=tenant_pair.owner_a,
        items=[{"product_id": str(product.id), "quantity": "1"}],
        payment_method=Payment.Method.CASH,
        idempotency_key="receipt-qr-lookup",
    )
    original_name = product.name
    product.name = "Renamed after sale"
    product.barcode = "9999999999999"
    product.save(update_fields=["name", "barcode"])

    client = APIClient()
    client.force_authenticate(tenant_pair.owner_a)
    response = client.get(
        (
            f"/api/v1/locations/{tenant_pair.location_a.id}/"
            f"sales/receipt-lookup/?qr={sale.receipt_qr_identifier}"
        ),
        HTTP_X_TENANT_SLUG=tenant_pair.organization_a.slug,
    )

    assert response.status_code == 200
    assert response.json()["items"][0]["product_name"] == original_name
    assert response.json()["items"][0]["barcode"] == "0123456789012"


def test_sequential_checkout_cannot_oversell(tenant_pair):
    product = stocked_product(tenant_pair, quantity="1")
    complete_sale(
        organization=tenant_pair.organization_a,
        location=tenant_pair.location_a,
        actor=tenant_pair.owner_a,
        items=[{"product_id": str(product.id), "quantity": "1"}],
        payment_method=Payment.Method.CASH,
        idempotency_key="stock-sale-1",
    )
    with pytest.raises(InsufficientStock):
        complete_sale(
            organization=tenant_pair.organization_a,
            location=tenant_pair.location_a,
            actor=tenant_pair.owner_a,
            items=[{"product_id": str(product.id), "quantity": "1"}],
            payment_method=Payment.Method.CASH,
            idempotency_key="stock-sale-2",
        )


def test_location_transfer_creates_balanced_movements(tenant_pair):
    source_product = stocked_product(tenant_pair, quantity="8")
    destination = Location.objects.create(
        organization=tenant_pair.organization_a,
        name="Second Store",
        code="SECOND",
        kind=Location.Kind.STORE,
    )
    destination_product = Product.objects.create(
        organization=tenant_pair.organization_a,
        location=destination,
        name=source_product.name,
        sku=source_product.sku,
        unit=source_product.unit,
        selling_price=source_product.selling_price,
        cost_price=source_product.cost_price,
    )
    transfer = StockTransfer.objects.create(
        organization=tenant_pair.organization_a,
        number="TRF-000001",
        source_location=tenant_pair.location_a,
        destination_location=destination,
        created_by=tenant_pair.owner_a,
    )
    TransferItem.objects.create(
        organization=tenant_pair.organization_a,
        transfer=transfer,
        source_product=source_product,
        destination_product=destination_product,
        quantity=Decimal("3"),
    )

    dispatch_transfer(transfer=transfer, actor=tenant_pair.owner_a)
    receive_transfer(transfer=transfer, actor=tenant_pair.owner_a)

    source_balance = InventoryBalance.objects.get(product=source_product)
    destination_balance = InventoryBalance.objects.get(
        product=destination_product
    )
    assert source_balance.quantity == Decimal("5")
    assert destination_balance.quantity == Decimal("3")
    assert StockMovement.objects.filter(
        source_id=str(transfer.id),
        kind=StockMovement.Kind.TRANSFER_OUT,
        quantity=Decimal("-3"),
    ).exists()
    assert StockMovement.objects.filter(
        source_id=str(transfer.id),
        kind=StockMovement.Kind.TRANSFER_IN,
        quantity=Decimal("3"),
    ).exists()
