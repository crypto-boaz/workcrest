from django.contrib import admin

from .models import (
    Category,
    Customer,
    CustomerLedgerEntry,
    DocumentSequence,
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
    SupplierLedgerEntry,
    TransferItem,
)


admin.site.register(
    [
        Category,
        Product,
        InventoryBalance,
        StockMovement,
        Customer,
        Supplier,
        DocumentSequence,
        Sale,
        SaleItem,
        Payment,
        HeldCart,
        ReturnRecord,
        ReturnItem,
        PurchaseOrder,
        PurchaseItem,
        StockTransfer,
        TransferItem,
        CustomerLedgerEntry,
        SupplierLedgerEntry,
        Expense,
    ]
)
