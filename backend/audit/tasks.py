import json
import zipfile
from datetime import timedelta
from io import BytesIO

from celery import shared_task
from django.core.files.base import ContentFile
from django.forms.models import model_to_dict
from django.utils import timezone

from commerce.models import (
    Customer,
    Expense,
    Product,
    PurchaseOrder,
    Sale,
    StockMovement,
    StockTransfer,
    Supplier,
)
from organizations.models import Location, Membership
from organizations.models import Organization
from organizations.tasks import TenantTask

from .models import ExportJob, OutboxEvent


def _json_bytes(queryset):
    rows = []
    for instance in queryset.iterator(chunk_size=500):
        row = model_to_dict(instance)
        row["id"] = str(instance.pk)
        rows.append(row)
    return json.dumps(rows, default=str, ensure_ascii=False, indent=2).encode()


@shared_task(bind=True, base=TenantTask)
def build_tenant_export(self, *, organization_id, export_job_id):
    job = ExportJob.objects.get(
        id=export_job_id, organization_id=organization_id
    )
    job.status = ExportJob.Status.PROCESSING
    job.save(update_fields=["status", "updated_at"])
    datasets = {
        "locations.json": Location.objects.filter(organization_id=organization_id),
        "memberships.json": Membership.objects.filter(
            organization_id=organization_id
        ),
        "products.json": Product.objects.filter(organization_id=organization_id),
        "customers.json": Customer.objects.filter(organization_id=organization_id),
        "suppliers.json": Supplier.objects.filter(organization_id=organization_id),
        "sales.json": Sale.objects.filter(organization_id=organization_id),
        "stock_movements.json": StockMovement.objects.filter(
            organization_id=organization_id
        ),
        "purchases.json": PurchaseOrder.objects.filter(
            organization_id=organization_id
        ),
        "transfers.json": StockTransfer.objects.filter(
            organization_id=organization_id
        ),
        "expenses.json": Expense.objects.filter(organization_id=organization_id),
    }
    try:
        buffer = BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            for filename, queryset in datasets.items():
                archive.writestr(filename, _json_bytes(queryset))
        job.file.save(
            f"{organization_id}-{job.id}.zip",
            ContentFile(buffer.getvalue()),
            save=False,
        )
        job.status = ExportJob.Status.READY
        job.expires_at = timezone.now() + timedelta(days=7)
        job.save(
            update_fields=[
                "file",
                "status",
                "expires_at",
                "updated_at",
            ]
        )
    except Exception as exc:
        job.status = ExportJob.Status.FAILED
        job.error = str(exc)[:2000]
        job.save(update_fields=["status", "error", "updated_at"])
        raise


@shared_task(bind=True, base=TenantTask)
def dispatch_outbox(self, *, organization_id):
    events = OutboxEvent.objects.filter(
        organization_id=organization_id,
        status=OutboxEvent.Status.PENDING,
        available_at__lte=timezone.now(),
    )[:100]
    published = 0
    for event in events:
        event.status = OutboxEvent.Status.PUBLISHED
        event.attempts += 1
        event.published_at = timezone.now()
        event.save(
            update_fields=[
                "status",
                "attempts",
                "published_at",
                "updated_at",
            ]
        )
        published += 1
    return published


@shared_task
def dispatch_all_outboxes():
    queued = 0
    for organization_id in Organization.objects.values_list("id", flat=True):
        dispatch_outbox.delay(organization_id=str(organization_id))
        queued += 1
    return queued


@shared_task
def expire_export_files():
    now = timezone.now()
    expired = ExportJob.objects.filter(
        status=ExportJob.Status.READY, expires_at__lte=now
    )
    count = 0
    for organization_id in Organization.objects.values_list("id", flat=True):
        from organizations.tenancy import organization_context

        with organization_context(organization_id):
            for job in expired.filter(organization_id=organization_id):
                if job.file:
                    job.file.delete(save=False)
                job.status = ExportJob.Status.EXPIRED
                job.save(update_fields=["file", "status", "updated_at"])
                count += 1
    return count
