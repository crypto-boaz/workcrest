from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    BootstrapView,
    BrandingView,
    CompanyLogoView,
    CompanySettingsView,
    CustomFieldViewSet,
    InvitationAcceptanceView,
    InvitationViewSet,
    LocationViewSet,
    MembershipViewSet,
    ModuleViewSet,
    OnboardingView,
    RoleViewSet,
    SessionContextView,
    TenantManifestView,
)


router = DefaultRouter()
router.register("locations", LocationViewSet, basename="locations")
router.register("memberships", MembershipViewSet, basename="memberships")
router.register("roles", RoleViewSet, basename="roles")
router.register("invitations", InvitationViewSet, basename="invitations")
router.register("modules", ModuleViewSet, basename="modules")
router.register("custom-fields", CustomFieldViewSet, basename="custom-fields")

urlpatterns = [
    path("tenant-manifest/", TenantManifestView.as_view(), name="tenant-manifest"),
    path("session/context/", SessionContextView.as_view(), name="session-context"),
    path("bootstrap/", BootstrapView.as_view(), name="bootstrap"),
    path("onboarding/", OnboardingView.as_view(), name="onboarding"),
    path("branding/", BrandingView.as_view(), name="branding"),
    path(
        "company-settings/",
        CompanySettingsView.as_view(),
        name="company-settings",
    ),
    path(
        "company-logo/",
        CompanyLogoView.as_view(),
        name="company-logo",
    ),
    path(
        "invitations/accept/",
        InvitationAcceptanceView.as_view(),
        name="invitation-accept",
    ),
] + router.urls
