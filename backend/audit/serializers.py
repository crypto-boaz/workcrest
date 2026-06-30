from rest_framework import serializers

from .models import ExportJob


class ExportJobSerializer(serializers.ModelSerializer):
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = ExportJob
        fields = [
            "id",
            "export_type",
            "status",
            "download_url",
            "expires_at",
            "error",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_download_url(self, obj) -> str | None:
        if not obj.file or obj.status != ExportJob.Status.READY:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(obj.file.url) if request else obj.file.url
