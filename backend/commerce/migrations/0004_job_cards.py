import django.db.models.deletion
import django.utils.timezone
import uuid
from decimal import Decimal

from django.conf import settings
from django.db import migrations, models


TABLES = ("commerce_jobcard", "commerce_jobcardpayment", "commerce_jobcardevent")


def enable_rls(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    quote = schema_editor.quote_name
    for table in TABLES:
        policy = f"{table}_tenant_isolation"
        schema_editor.execute(f"ALTER TABLE {quote(table)} ENABLE ROW LEVEL SECURITY")
        schema_editor.execute(f"ALTER TABLE {quote(table)} FORCE ROW LEVEL SECURITY")
        schema_editor.execute(f"""
            CREATE POLICY {quote(policy)} ON {quote(table)}
            USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
            WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
        """)


def disable_rls(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    quote = schema_editor.quote_name
    for table in reversed(TABLES):
        schema_editor.execute(f"DROP POLICY IF EXISTS {quote(table + '_tenant_isolation')} ON {quote(table)}")
        schema_editor.execute(f"ALTER TABLE {quote(table)} DISABLE ROW LEVEL SECURITY")


def base_fields():
    return [
        ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
        ("created_at", models.DateTimeField(auto_now_add=True)),
        ("updated_at", models.DateTimeField(auto_now=True)),
        ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="organizations.organization")),
        ("location", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="organizations.location")),
    ]


class Migration(migrations.Migration):
    dependencies = [
        ("commerce", "0003_commerce_performance_indexes"),
        ("organizations", "0007_organization_job_cards_enabled"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="JobCard",
            fields=base_fields() + [
                ("number", models.CharField(max_length=40)),
                ("customer_name", models.CharField(max_length=180)),
                ("customer_phone", models.CharField(max_length=32)),
                ("device_name", models.CharField(max_length=180)),
                ("serial_number", models.CharField(blank=True, max_length=120)),
                ("reported_issue", models.TextField()),
                ("intake_condition", models.TextField(blank=True)),
                ("accessories", models.TextField(blank=True)),
                ("diagnosis", models.TextField(blank=True)),
                ("work_done", models.TextField(blank=True)),
                ("status", models.CharField(choices=[
                    ("received", "Received"), ("diagnosing", "Diagnosing"),
                    ("awaiting_approval", "Awaiting approval"), ("in_progress", "In progress"),
                    ("ready", "Ready for collection"), ("collected", "Collected"),
                    ("cancelled", "Cancelled"),
                ], default="received", max_length=24)),
                ("labour_charge", models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=18)),
                ("parts_charge", models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=18)),
                ("expected_at", models.DateField(blank=True, null=True)),
                ("received_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("completed_at", models.DateTimeField(blank=True, null=True)),
                ("collected_at", models.DateTimeField(blank=True, null=True)),
                ("created_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
                ("version", models.PositiveIntegerField(default=1)),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="JobCardPayment",
            fields=base_fields() + [
                ("amount", models.DecimalField(decimal_places=2, max_digits=18)),
                ("method", models.CharField(choices=[("cash", "Cash"), ("card", "Card"), ("transfer", "Transfer")], max_length=16)),
                ("reference", models.CharField(blank=True, max_length=100)),
                ("received_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("job_card", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="payments", to="commerce.jobcard")),
                ("received_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["created_at"]},
        ),
        migrations.CreateModel(
            name="JobCardEvent",
            fields=base_fields() + [
                ("status", models.CharField(choices=[
                    ("received", "Received"), ("diagnosing", "Diagnosing"),
                    ("awaiting_approval", "Awaiting approval"), ("in_progress", "In progress"),
                    ("ready", "Ready for collection"), ("collected", "Collected"),
                    ("cancelled", "Cancelled"),
                ], max_length=24)),
                ("note", models.CharField(blank=True, max_length=500)),
                ("actor", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
                ("job_card", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="events", to="commerce.jobcard")),
            ],
            options={"ordering": ["created_at"]},
        ),
        migrations.AddConstraint(
            model_name="jobcard",
            constraint=models.UniqueConstraint(fields=("organization", "number"), name="unique_job_card_number_per_org"),
        ),
        migrations.AddIndex(
            model_name="jobcard",
            index=models.Index(fields=["organization", "location", "status", "-created_at"], name="comm_job_status_time_idx"),
        ),
        migrations.RunPython(enable_rls, disable_rls),
    ]
