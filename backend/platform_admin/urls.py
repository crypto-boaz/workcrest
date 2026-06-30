from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    InvoiceViewSet,
    ManualPaymentViewSet,
    PlatformOrganizationViewSet,
    PlatformPlanViewSet,
    PlatformSubscriptionViewSet,
    SupportSessionViewSet,
    TenantModuleControlViewSet,
)


router = DefaultRouter()
router.register("tenants", PlatformOrganizationViewSet, basename="platform-tenant")
router.register("plans", PlatformPlanViewSet, basename="platform-plan")
router.register(
    "subscriptions",
    PlatformSubscriptionViewSet,
    basename="platform-subscription",
)
router.register(
    "tenant-modules",
    TenantModuleControlViewSet,
    basename="platform-tenant-module",
)
router.register("invoices", InvoiceViewSet, basename="platform-invoice")
router.register("payments", ManualPaymentViewSet, basename="platform-payment")
router.register(
    "support-sessions",
    SupportSessionViewSet,
    basename="platform-support-session",
)

urlpatterns = [path("", include(router.urls))]
