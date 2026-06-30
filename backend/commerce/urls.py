from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    CategoryViewSet,
    CustomerViewSet,
    DashboardView,
    ExpenseViewSet,
    HeldCartViewSet,
    ProductViewSet,
    PurchaseOrderViewSet,
    ReportsView,
    ReturnRecordViewSet,
    SaleViewSet,
    StockMovementViewSet,
    StockTransferViewSet,
    SupplierViewSet,
)


router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="category")
router.register("products", ProductViewSet, basename="product")
router.register("customers", CustomerViewSet, basename="customer")
router.register("suppliers", SupplierViewSet, basename="supplier")
router.register("sales", SaleViewSet, basename="sale")
router.register("returns", ReturnRecordViewSet, basename="return")
router.register("purchases", PurchaseOrderViewSet, basename="purchase")
router.register("transfers", StockTransferViewSet, basename="transfer")
router.register("expenses", ExpenseViewSet, basename="expense")
router.register("held-carts", HeldCartViewSet, basename="held-cart")
router.register("stock-movements", StockMovementViewSet, basename="stock-movement")


urlpatterns = [
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("reports/", ReportsView.as_view(), name="reports"),
    path("", include(router.urls)),
]
