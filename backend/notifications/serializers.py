from rest_framework import serializers

from .models import Notification, NotificationRecipient


class NotificationSerializer(serializers.ModelSerializer):
    read_at = serializers.DateTimeField(source="recipient_read_at", read_only=True)
    dismissed_at = serializers.DateTimeField(
        source="recipient_dismissed_at", read_only=True
    )
    location_name = serializers.CharField(source="location.name", read_only=True)

    class Meta:
        model = Notification
        fields = [
            "id",
            "location",
            "location_name",
            "module_code",
            "title",
            "body",
            "tone",
            "href",
            "read_at",
            "dismissed_at",
            "created_at",
        ]


class NotificationPreferenceSerializer(serializers.Serializer):
    operational_in_app = serializers.BooleanField(default=True, read_only=True)
    authentication_email = serializers.BooleanField(default=True, read_only=True)

