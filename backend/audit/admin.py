from django.contrib import admin

from .models import AuditEvent, ExportJob, IdempotencyRecord, OutboxEvent


admin.site.register([AuditEvent, OutboxEvent, IdempotencyRecord, ExportJob])
