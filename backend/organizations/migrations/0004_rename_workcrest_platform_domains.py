from django.db import migrations


OLD_SUFFIX = ".timphat.local"
NEW_SUFFIX = ".workcrest.local"


def rename_platform_domains(apps, schema_editor):
    TenantDomain = apps.get_model("organizations", "TenantDomain")
    domains = TenantDomain.objects.filter(
        kind="subdomain",
        domain__endswith=OLD_SUFFIX,
    )
    for tenant_domain in domains.iterator():
        tenant_domain.domain = (
            f"{tenant_domain.domain.removesuffix(OLD_SUFFIX)}{NEW_SUFFIX}"
        )
        tenant_domain.save(update_fields=["domain"])


def restore_platform_domains(apps, schema_editor):
    TenantDomain = apps.get_model("organizations", "TenantDomain")
    domains = TenantDomain.objects.filter(
        kind="subdomain",
        domain__endswith=NEW_SUFFIX,
    )
    for tenant_domain in domains.iterator():
        tenant_domain.domain = (
            f"{tenant_domain.domain.removesuffix(NEW_SUFFIX)}{OLD_SUFFIX}"
        )
        tenant_domain.save(update_fields=["domain"])


class Migration(migrations.Migration):
    dependencies = [
        ("organizations", "0003_remove_roleassignment_unique_role_assignment_scope_and_more"),
    ]

    operations = [
        migrations.RunPython(
            rename_platform_domains,
            reverse_code=restore_platform_domains,
        ),
    ]
