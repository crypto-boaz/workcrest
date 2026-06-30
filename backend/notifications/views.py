from django.db.models import F
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from organizations.access import TenantAccessPermission
from organizations.tenancy import TenantContextMixin
from config.pagination import TransactionPagination

from .models import Notification, NotificationRecipient
from .serializers import NotificationPreferenceSerializer, NotificationSerializer


class NotificationViewSet(TenantContextMixin, viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated, TenantAccessPermission]
    serializer_class = NotificationSerializer
    pagination_class = TransactionPagination
    queryset = Notification.objects.none()

    def get_queryset(self):
        return (
            Notification.objects.filter(
                organization=self.request.organization,
                notificationrecipient__user=self.request.user,
                notificationrecipient__dismissed_at__isnull=True,
            )
            .select_related("location")
            .annotate(
                recipient_read_at=F("notificationrecipient__read_at"),
                recipient_dismissed_at=F("notificationrecipient__dismissed_at"),
            )
        )

    @action(detail=True, methods=["post"], url_path="mark-read")
    def mark_read(self, request, **kwargs):
        notification = self.get_object()
        NotificationRecipient.objects.filter(
            organization=request.organization,
            notification=notification,
            user=request.user,
        ).update(read_at=timezone.now())
        return Response({"status": "read"})

    @action(detail=True, methods=["post"])
    def dismiss(self, request, **kwargs):
        notification = self.get_object()
        NotificationRecipient.objects.filter(
            organization=request.organization,
            notification=notification,
            user=request.user,
        ).update(dismissed_at=timezone.now())
        return Response({"status": "dismissed"})

    @action(detail=False, methods=["post"], url_path="mark-all-read")
    def mark_all_read(self, request):
        updated = NotificationRecipient.objects.filter(
            organization=request.organization,
            notification__organization=request.organization,
            user=request.user,
            read_at__isnull=True,
        ).update(read_at=timezone.now())
        return Response({"updated": updated})

    @action(detail=False, methods=["get"])
    def unread_count(self, request):
        count = NotificationRecipient.objects.filter(
            organization=request.organization,
            notification__organization=request.organization,
            user=request.user,
            read_at__isnull=True,
            dismissed_at__isnull=True,
        ).count()
        return Response({"count": count})

    @action(detail=False, methods=["get"])
    def preferences(self, request):
        return Response(NotificationPreferenceSerializer({}).data)
