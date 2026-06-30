from django.conf import settings
from django.db import models

from organizations.models import Location, OrganizationOwnedModel, UUIDTimeStampedModel


class Notification(OrganizationOwnedModel):
    class Tone(models.TextChoices):
        INFO = "info", "Information"
        WARNING = "warning", "Warning"
        SUCCESS = "success", "Success"
        ERROR = "error", "Error"

    location = models.ForeignKey(
        Location, null=True, blank=True, on_delete=models.CASCADE
    )
    module_code = models.CharField(max_length=50, default="platform")
    title = models.CharField(max_length=180)
    body = models.TextField()
    tone = models.CharField(
        max_length=16, choices=Tone.choices, default=Tone.INFO
    )
    href = models.CharField(max_length=240, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )
    recipients = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        through="NotificationRecipient",
        related_name="notifications",
    )

    class Meta:
        ordering = ["-created_at"]


class NotificationRecipient(OrganizationOwnedModel):
    notification = models.ForeignKey(Notification, on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    read_at = models.DateTimeField(null=True, blank=True)
    dismissed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["notification", "user"],
                name="unique_notification_recipient",
            )
        ]
