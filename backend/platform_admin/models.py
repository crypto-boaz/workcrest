from django.conf import settings
from django.db import models
from django.utils import timezone

from organizations.models import Organization, UUIDTimeStampedModel


class SupportSession(UUIDTimeStampedModel):
    platform_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="support_sessions",
    )
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    reason = models.TextField()
    expires_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)
    created_ip = models.GenericIPAddressField(null=True, blank=True)

    @property
    def is_active(self):
        return self.ended_at is None and self.expires_at > timezone.now()
