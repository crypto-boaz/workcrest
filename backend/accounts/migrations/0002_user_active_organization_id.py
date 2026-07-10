from django.db import migrations, models


def backfill_active_organizations(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    Membership = apps.get_model("organizations", "Membership")
    for user in User.objects.filter(active_organization_id__isnull=True).iterator():
        membership = (
            Membership.objects.filter(user_id=user.pk, status="active")
            .order_by("-is_owner", "joined_at")
            .first()
        )
        if membership is None:
            continue
        user.active_organization_id = membership.organization_id
        user.save(update_fields=["active_organization_id"])


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0001_initial"),
        ("organizations", "0006_normalize_malformed_tenant_domains"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="active_organization_id",
            field=models.UUIDField(blank=True, null=True),
        ),
        migrations.RunPython(
            backfill_active_organizations,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
