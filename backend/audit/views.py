from rest_framework import status, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from organizations.access import TenantAccessPermission
from organizations.tenancy import TenantContextMixin

from .models import ExportJob
from .serializers import ExportJobSerializer
from .tasks import build_tenant_export


class ExportJobViewSet(TenantContextMixin, viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated, TenantAccessPermission]
    serializer_class = ExportJobSerializer
    queryset = ExportJob.objects.none()
    deny_support_access = True

    def get_queryset(self):
        if not self.request.membership.is_owner:
            return ExportJob.objects.none()
        return ExportJob.objects.filter(
            organization=self.request.organization,
            requested_by=self.request.user,
        )

    def create(self, request, *args, **kwargs):
        if not request.membership.is_owner:
            raise PermissionDenied("Only an organization owner can export all data.")
        job = ExportJob.objects.create(
            organization=request.organization,
            requested_by=request.user,
            export_type="tenant_data",
        )
        transaction = build_tenant_export.delay(
            organization_id=str(request.organization.id),
            export_job_id=str(job.id),
        )
        payload = self.get_serializer(job).data
        payload["task_id"] = transaction.id
        return Response(payload, status=status.HTTP_202_ACCEPTED)
