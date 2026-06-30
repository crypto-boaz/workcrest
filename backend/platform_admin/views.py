from datetime import timedelta

from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from audit.models import AuditEvent
from accounts.permissions import RecentAuthenticationRequired
from organizations.models import Organization, TenantModule
from organizations.tenancy import activate_organization
from subscriptions.models import Invoice, ManualPayment, Plan, Subscription

from .models import SupportSession
from .serializers import (
    InvoiceSerializer,
    ManualPaymentSerializer,
    PlatformOrganizationSerializer,
    PlatformPlanSerializer,
    PlatformSubscriptionSerializer,
    SupportSessionSerializer,
    TenantModuleControlSerializer,
    TenantProvisionSerializer,
)


class PlatformTenantContextMixin:
    control_organization = None

    def initial(self, request, *args, **kwargs):
        organization_id = (
            request.query_params.get("organization")
            or request.data.get("organization")
        )
        if not organization_id:
            raise ValidationError(
                {
                    "organization": (
                        "Select an organization for this control-plane request."
                    )
                }
            )
        self.control_organization = Organization.objects.filter(
            id=organization_id
        ).first()
        if self.control_organization is None:
            raise ValidationError({"organization": "Organization was not found."})
        activate_organization(self.control_organization.id)
        return super().initial(request, *args, **kwargs)


class PlatformOrganizationViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAdminUser, RecentAuthenticationRequired]
    queryset = Organization.objects.prefetch_related("subscription_set__plan")
    serializer_class = PlatformOrganizationSerializer
    filterset_fields = ["status", "industry_code"]
    search_fields = ["name", "legal_name", "slug"]

    def create(self, request, *args, **kwargs):
        serializer = TenantProvisionSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        organization = serializer.save()
        return Response(
            self.get_serializer(organization).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def cancel(self, request, **kwargs):
        organization = self.get_object()
        activate_organization(organization.id)
        now = timezone.now()
        organization.status = Organization.Status.CANCELLED
        organization.cancelled_at = now
        organization.purge_after = now + timedelta(days=30)
        organization.save(
            update_fields=[
                "status",
                "cancelled_at",
                "purge_after",
                "updated_at",
            ]
        )
        Subscription.objects.filter(organization=organization).update(
            status=Subscription.Status.CANCELLED, cancelled_at=now
        )
        AuditEvent.objects.create(
            organization=organization,
            actor=request.user,
            action="tenant.cancelled",
            target_type="Organization",
            target_id=str(organization.id),
            metadata={"purge_after": organization.purge_after.isoformat()},
        )
        return Response(self.get_serializer(organization).data)


class PlatformPlanViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAdminUser, RecentAuthenticationRequired]
    queryset = Plan.objects.prefetch_related("modules")
    serializer_class = PlatformPlanSerializer
    search_fields = ["name", "code"]


class PlatformSubscriptionViewSet(PlatformTenantContextMixin, viewsets.ModelViewSet):
    permission_classes = [IsAdminUser, RecentAuthenticationRequired]
    queryset = Subscription.objects.select_related("organization", "plan")
    serializer_class = PlatformSubscriptionSerializer
    filterset_fields = ["status", "plan", "organization"]


class TenantModuleControlViewSet(PlatformTenantContextMixin, viewsets.ModelViewSet):
    permission_classes = [IsAdminUser, RecentAuthenticationRequired]
    queryset = TenantModule.objects.select_related("organization", "module")
    serializer_class = TenantModuleControlSerializer
    filterset_fields = ["organization", "module", "status"]


class InvoiceViewSet(PlatformTenantContextMixin, viewsets.ModelViewSet):
    permission_classes = [IsAdminUser, RecentAuthenticationRequired]
    queryset = Invoice.objects.select_related("organization", "subscription")
    serializer_class = InvoiceSerializer
    filterset_fields = ["organization", "status"]
    search_fields = ["number", "organization__name"]


class ManualPaymentViewSet(PlatformTenantContextMixin, viewsets.ModelViewSet):
    permission_classes = [IsAdminUser, RecentAuthenticationRequired]
    queryset = ManualPayment.objects.select_related("organization", "invoice")
    serializer_class = ManualPaymentSerializer
    filterset_fields = ["organization", "invoice"]
    http_method_names = ["get", "post", "head", "options"]


class SupportSessionViewSet(PlatformTenantContextMixin, viewsets.ModelViewSet):
    permission_classes = [IsAdminUser, RecentAuthenticationRequired]
    queryset = SupportSession.objects.select_related("organization", "platform_user")
    serializer_class = SupportSessionSerializer
    http_method_names = ["get", "post", "head", "options"]
    filterset_fields = ["organization", "platform_user"]

    def perform_create(self, serializer):
        support_session = serializer.save()
        AuditEvent.objects.create(
            organization=support_session.organization,
            actor=self.request.user,
            support_session_id=support_session.id,
            action="support.started",
            target_type="SupportSession",
            target_id=str(support_session.id),
            request_id=getattr(self.request, "request_id", ""),
            metadata={
                "reason": support_session.reason,
                "expires_at": support_session.expires_at.isoformat(),
            },
        )

    @action(detail=True, methods=["post"])
    def enter(self, request, **kwargs):
        support_session = self.get_object()
        if not support_session.is_active:
            return Response(
                {"detail": "This support session has expired."},
                status=status.HTTP_410_GONE,
            )
        request.session["support_session_id"] = str(support_session.id)
        AuditEvent.objects.create(
            organization=support_session.organization,
            actor=request.user,
            support_session_id=support_session.id,
            action="support.entered",
            target_type="SupportSession",
            target_id=str(support_session.id),
            request_id=getattr(request, "request_id", ""),
        )
        return Response(
            {
                "support_session": self.get_serializer(support_session).data,
                "tenant_slug": support_session.organization.slug,
            }
        )

    @action(detail=True, methods=["post"])
    def end(self, request, **kwargs):
        support_session = self.get_object()
        if support_session.ended_at is None:
            support_session.ended_at = timezone.now()
            support_session.save(update_fields=["ended_at", "updated_at"])
            AuditEvent.objects.create(
                organization=support_session.organization,
                actor=request.user,
                support_session_id=support_session.id,
                action="support.ended",
                target_type="SupportSession",
                target_id=str(support_session.id),
                request_id=getattr(request, "request_id", ""),
            )
        if request.session.get("support_session_id") == str(support_session.id):
            request.session.pop("support_session_id", None)
        return Response(self.get_serializer(support_session).data)
