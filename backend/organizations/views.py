import hashlib

from django.db import transaction
from django.conf import settings
from django.middleware.csrf import get_token
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import OpenApiTypes, extend_schema

from accounts.permissions import RecentAuthenticationRequired
from audit.services import record_audit
from subscriptions.services import entitlement_snapshot, get_subscription

from .access import (
    OrganizationOwnerPermission,
    TenantAccessPermission,
    effective_capabilities,
    membership_for,
)
from .models import (
    BrandingProfile,
    CustomFieldDefinition,
    Invitation,
    Location,
    Membership,
    Organization,
    Role,
    RoleAssignment,
    TenantModule,
)
from .serializers import (
    BrandingSerializer,
    CompanyLogoSerializer,
    CompanySettingsSerializer,
    CustomFieldSerializer,
    InvitationAcceptanceSerializer,
    InvitationSerializer,
    LocationSerializer,
    MembershipSerializer,
    ModuleSerializer,
    OnboardingSerializer,
    OrganizationSerializer,
    RoleSerializer,
    UserSummarySerializer,
)
from .tenancy import TenantContextMixin, activate_organization


class TenantManifestView(TenantContextMixin, APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        organization = request.organization
        if organization is None:
            return Response(
                {
                    "organization": {
                        "slug": "workcrest",
                        "industry_code": "platform",
                        "locale": "en-NG",
                        "currency": "NGN",
                    },
                    "branding": {
                        "display_name": settings.PLATFORM_NAME,
                        "logo_url": "",
                        "favicon_url": "",
                        "primary_color": "#2563EB",
                        "accent_color": "#10B981",
                        "receipt_header": "",
                        "receipt_footer": "",
                        "terminology": {},
                        "document_prefixes": {},
                    },
                }
            )
        branding = get_object_or_404(BrandingProfile, organization=organization)
        return Response(
            {
                "organization": {
                    "slug": organization.slug,
                    "industry_code": organization.industry_code,
                    "locale": organization.locale,
                    "currency": organization.currency,
                },
                "branding": BrandingSerializer(
                    branding, context={"request": request}
                ).data,
            }
        )


class SessionContextView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return Response(
            {
                "authenticated": request.user.is_authenticated,
                "csrf_token": get_token(request),
                "user": UserSummarySerializer(request.user).data
                if request.user.is_authenticated
                else None,
            }
        )


class BootstrapView(TenantContextMixin, APIView):
    permission_classes = [IsAuthenticated, TenantAccessPermission]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        organization = request.organization
        membership = request.membership
        branding = BrandingProfile.objects.get(organization=organization)
        locations = Location.objects.filter(
            organization=organization, is_active=True
        )
        capabilities = (
            {"*"} if request.support_session is not None else effective_capabilities(membership)
        )
        modules = TenantModule.objects.filter(organization=organization).select_related(
            "module"
        )
        custom_fields = CustomFieldDefinition.objects.filter(
            organization=organization, is_active=True
        )
        return Response(
            {
                "user": UserSummarySerializer(request.user).data,
                "organization": OrganizationSerializer(organization).data,
                "membership": (
                    MembershipSerializer(membership).data if membership else None
                ),
                "locations": LocationSerializer(locations, many=True).data,
                "branding": BrandingSerializer(
                    branding, context={"request": request}
                ).data,
                "modules": ModuleSerializer(modules, many=True).data,
                "capabilities": sorted(capabilities),
                "entitlements": entitlement_snapshot(organization),
                "custom_fields": CustomFieldSerializer(custom_fields, many=True).data,
                "support_session": (
                    {
                        "id": str(request.support_session.id),
                        "reason": request.support_session.reason,
                        "expires_at": request.support_session.expires_at,
                        "actor": UserSummarySerializer(request.user).data,
                    }
                    if request.support_session
                    else None
                ),
            }
        )


class OnboardingView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=OnboardingSerializer, responses=OpenApiTypes.OBJECT)
    def post(self, request):
        serializer = OnboardingSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        result = serializer.save()
        organization = result["organization"]
        request.session["active_tenant_slug"] = organization.slug
        if settings.DEBUG:
            request.session["debug_tenant_slug"] = organization.slug
        tenant_domain = organization.tenantdomain_set.get(
            is_primary=True
        ).domain
        workspace_url = (
            f"{settings.FRONTEND_URL}/dashboard"
            if settings.SINGLE_HOST_TENANCY
            else f"https://{tenant_domain}/dashboard"
        )
        return Response(
            {
                "organization": OrganizationSerializer(organization).data,
                "location": LocationSerializer(result["location"]).data,
                "tenant_domain": tenant_domain,
                "workspace_url": workspace_url,
                "single_host_tenancy": settings.SINGLE_HOST_TENANCY,
            },
            status=status.HTTP_201_CREATED,
        )


class TenantViewSet(TenantContextMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, TenantAccessPermission]

    def perform_create(self, serializer):
        serializer.save(organization=self.request.organization)


class LocationViewSet(TenantViewSet):
    queryset = Location.objects.none()
    serializer_class = LocationSerializer
    http_method_names = ["get", "head", "options"]
    required_capability = "settings.manage"
    deny_support_access = True
    permission_classes = [
        IsAuthenticated,
        TenantAccessPermission,
        OrganizationOwnerPermission,
        RecentAuthenticationRequired,
    ]

    def get_queryset(self):
        return Location.objects.filter(organization=self.request.organization)


class RoleViewSet(TenantViewSet):
    queryset = Role.objects.none()
    serializer_class = RoleSerializer
    required_capability = "staff.manage"
    deny_support_access = True
    permission_classes = [
        IsAuthenticated,
        TenantAccessPermission,
        RecentAuthenticationRequired,
    ]

    def get_queryset(self):
        return Role.objects.filter(organization=self.request.organization).prefetch_related(
            "capabilities"
        )


class MembershipViewSet(TenantViewSet):
    queryset = Membership.objects.none()
    serializer_class = MembershipSerializer
    http_method_names = ["get", "patch", "head", "options"]
    required_capability = "staff.manage"
    deny_support_access = True
    permission_classes = [
        IsAuthenticated,
        TenantAccessPermission,
        RecentAuthenticationRequired,
    ]

    def get_queryset(self):
        return Membership.objects.filter(
            organization=self.request.organization
        ).select_related("user")

    def perform_update(self, serializer):
        next_status = serializer.validated_data.get(
            "status", serializer.instance.status
        )
        if (
            next_status == Membership.Status.ACTIVE
            and serializer.instance.status != Membership.Status.ACTIVE
        ):
            subscription = get_subscription(self.request.organization)
            limit = (
                subscription.effective_limits.get("active_staff")
                if subscription
                else 0
            )
            active_staff = Membership.objects.filter(
                organization=self.request.organization,
                status=Membership.Status.ACTIVE,
            ).count()
            if limit is not None and active_staff >= limit:
                raise ValidationError(
                    {"plan": "Your current plan has reached its staff limit."}
                )
        serializer.save()


class InvitationViewSet(TenantViewSet):
    queryset = Invitation.objects.none()
    serializer_class = InvitationSerializer
    required_capability = "staff.manage"
    deny_support_access = True
    permission_classes = [
        IsAuthenticated,
        TenantAccessPermission,
        RecentAuthenticationRequired,
    ]

    def get_queryset(self):
        return Invitation.objects.filter(organization=self.request.organization)

    def create(self, request, *args, **kwargs):
        subscription = get_subscription(request.organization)
        limit = (
            subscription.effective_limits.get("active_staff")
            if subscription
            else 0
        )
        active_staff = Membership.objects.filter(
            organization=request.organization,
            status=Membership.Status.ACTIVE,
        ).count()
        pending = Invitation.objects.filter(
            organization=request.organization,
            status=Invitation.Status.PENDING,
            expires_at__gt=timezone.now(),
        ).count()
        if limit is not None and active_staff + pending >= limit:
            raise ValidationError(
                {"plan": "Your current plan has reached its staff limit."}
            )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        payload = dict(serializer.data)
        payload["acceptance_token"] = serializer.context.get("invitation_token")
        return Response(payload, status=status.HTTP_201_CREATED)


class ModuleViewSet(TenantViewSet):
    queryset = TenantModule.objects.none()
    serializer_class = ModuleSerializer
    http_method_names = ["get", "head", "options"]

    def get_queryset(self):
        return TenantModule.objects.filter(
            organization=self.request.organization
        ).select_related("module")


class CustomFieldViewSet(TenantViewSet):
    queryset = CustomFieldDefinition.objects.none()
    serializer_class = CustomFieldSerializer
    required_capability = "settings.manage"
    deny_support_access = True
    permission_classes = [
        IsAuthenticated,
        TenantAccessPermission,
        RecentAuthenticationRequired,
    ]

    def get_queryset(self):
        return CustomFieldDefinition.objects.filter(
            organization=self.request.organization
        )


class BrandingView(TenantContextMixin, APIView):
    permission_classes = [IsAuthenticated, TenantAccessPermission]
    required_capability = "settings.manage"
    deny_support_access = True
    permission_classes = [
        IsAuthenticated,
        TenantAccessPermission,
        RecentAuthenticationRequired,
    ]

    def get_object(self):
        return BrandingProfile.objects.get(organization=self.request.organization)

    @extend_schema(responses=BrandingSerializer)
    def get(self, request):
        return Response(
            BrandingSerializer(self.get_object(), context={"request": request}).data
        )


class CompanySettingsView(TenantContextMixin, APIView):
    permission_classes = [
        IsAuthenticated,
        TenantAccessPermission,
        OrganizationOwnerPermission,
        RecentAuthenticationRequired,
    ]
    required_capability = "settings.manage"
    deny_support_access = True

    def _payload(self, organization, branding, location):
        return {
            "organization": OrganizationSerializer(organization).data,
            "branding": BrandingSerializer(
                branding, context={"request": self.request}
            ).data,
            "primary_location": LocationSerializer(location).data,
        }

    def _objects(self, *, lock=False):
        organization_query = self.request.organization.__class__.objects
        branding_query = BrandingProfile.objects
        location_query = Location.objects
        if lock:
            organization_query = organization_query.select_for_update()
            branding_query = branding_query.select_for_update()
            location_query = location_query.select_for_update()
        organization = organization_query.get(id=self.request.organization.id)
        branding = branding_query.get(organization=organization)
        location = location_query.get(
            organization=organization,
            is_primary=True,
        )
        return organization, branding, location

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return Response(self._payload(*self._objects()))

    @extend_schema(
        request=CompanySettingsSerializer,
        responses=OpenApiTypes.OBJECT,
    )
    @transaction.atomic
    def patch(self, request):
        organization, branding, location = self._objects(lock=True)
        current = {
            "name": organization.name,
            "job_cards_enabled": organization.job_cards_enabled,
            "primary_color": branding.primary_color,
            "currency": organization.currency,
            "receipt_header": branding.receipt_header,
            "receipt_footer": branding.receipt_footer,
            "address": location.address,
        }
        serializer = CompanySettingsSerializer(
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        values = {**current, **serializer.validated_data}

        organization.name = values["name"]
        organization.job_cards_enabled = values["job_cards_enabled"]
        organization.currency = values["currency"]
        organization.save(update_fields=["name", "job_cards_enabled", "currency", "updated_at"])

        branding.display_name = values["name"]
        branding.primary_color = values["primary_color"]
        branding.receipt_header = values["receipt_header"]
        branding.receipt_footer = values["receipt_footer"]
        branding.save(
            update_fields=[
                "display_name",
                "primary_color",
                "receipt_header",
                "receipt_footer",
                "updated_at",
            ]
        )

        location.address = values["address"]
        location.save(update_fields=["address", "updated_at"])
        record_audit(
            organization=organization,
            location=location,
            actor=request.user,
            action="organization.settings_updated",
            target=organization,
            request=request,
            metadata={
                "fields": sorted(serializer.validated_data),
            },
        )
        return Response(self._payload(organization, branding, location))


class CompanyLogoView(CompanySettingsView):
    serializer_class = CompanyLogoSerializer

    @extend_schema(
        request=CompanyLogoSerializer,
        responses=OpenApiTypes.OBJECT,
    )
    @transaction.atomic
    def post(self, request):
        serializer = CompanyLogoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        organization, branding, location = self._objects(lock=True)
        old_logo_name = branding.logo.name if branding.logo else ""
        branding.logo = serializer.validated_data["logo"]
        branding.logo_url = ""
        branding.save(update_fields=["logo", "logo_url", "updated_at"])
        if old_logo_name and old_logo_name != branding.logo.name:
            storage = branding.logo.storage
            transaction.on_commit(
                lambda name=old_logo_name: storage.delete(name)
            )
        record_audit(
            organization=organization,
            location=location,
            actor=request.user,
            action="organization.logo_updated",
            target=branding,
            request=request,
        )
        return Response(self._payload(organization, branding, location))

    @extend_schema(request=None, responses=OpenApiTypes.OBJECT)
    @transaction.atomic
    def delete(self, request):
        organization, branding, location = self._objects(lock=True)
        old_logo_name = branding.logo.name if branding.logo else ""
        branding.logo = None
        branding.logo_url = ""
        branding.save(update_fields=["logo", "logo_url", "updated_at"])
        if old_logo_name:
            storage = branding.logo.storage
            transaction.on_commit(
                lambda name=old_logo_name: storage.delete(name)
            )
        record_audit(
            organization=organization,
            location=location,
            actor=request.user,
            action="organization.logo_removed",
            target=branding,
            request=request,
        )
        return Response(self._payload(organization, branding, location))


class InvitationAcceptanceView(TenantContextMixin, APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=InvitationAcceptanceSerializer,
        responses=MembershipSerializer,
    )
    @transaction.atomic
    def post(self, request):
        serializer = InvitationAcceptanceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        raw_token = serializer.validated_data["token"]
        organization_slug = serializer.validated_data.get("organization_slug")
        organization = (
            get_object_or_404(Organization, slug=organization_slug)
            if organization_slug
            else request.organization
        )
        if organization is None:
            raise ValidationError(
                {"organization_slug": "Specify the company for this invitation."}
            )
        activate_organization(organization.id)
        request.organization = organization
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        invitation = get_object_or_404(
            Invitation.objects.select_for_update().prefetch_related("locations"),
            organization=organization,
            token_hash=token_hash,
        )
        if invitation.email.lower() != request.user.email.lower():
            return Response(
                {"detail": "This invitation was issued to another email address."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if (
            invitation.status != Invitation.Status.PENDING
            or invitation.expires_at <= timezone.now()
        ):
            return Response(
                {"detail": "This invitation is no longer valid."},
                status=status.HTTP_410_GONE,
            )
        membership, _ = Membership.objects.get_or_create(
            organization=organization,
            user=request.user,
            defaults={"status": Membership.Status.ACTIVE},
        )
        membership.status = Membership.Status.ACTIVE
        membership.save(update_fields=["status", "updated_at"])
        locations = list(invitation.locations.all())
        if locations:
            for location in locations:
                RoleAssignment.objects.get_or_create(
                    organization=organization,
                    membership=membership,
                    role=invitation.role,
                    location=location,
                )
        else:
            RoleAssignment.objects.get_or_create(
                organization=organization,
                membership=membership,
                role=invitation.role,
                location=None,
            )
        invitation.status = Invitation.Status.ACCEPTED
        invitation.accepted_at = timezone.now()
        invitation.save(update_fields=["status", "accepted_at", "updated_at"])
        request.session["active_tenant_slug"] = organization.slug
        if settings.DEBUG:
            request.session["debug_tenant_slug"] = organization.slug
        request.user.active_organization_id = organization.id
        request.user.save(update_fields=["active_organization_id"])
        return Response(MembershipSerializer(membership).data)
