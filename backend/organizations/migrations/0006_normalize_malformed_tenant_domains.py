from django.db import migrations


def normalize_malformed_tenant_domains(apps, schema_editor):
    TenantDomain = apps.get_model("organizations", "TenantDomain")
    domains = TenantDomain.objects.filter(domain__contains="://")
    for tenant_domain in domains.iterator():
        normalized = tenant_domain.domain.strip().lower()
        normalized = normalized.replace(".https://", ".")
        normalized = normalized.replace(".http://", ".")
        normalized = normalized.removeprefix("https://")
        normalized = normalized.removeprefix("http://")
        normalized = normalized.split("/", 1)[0].split(":", 1)[0].strip(".")
        if not normalized or TenantDomain.objects.exclude(
            pk=tenant_domain.pk
        ).filter(domain=normalized).exists():
            continue
        tenant_domain.domain = normalized
        tenant_domain.save(update_fields=["domain"])


class Migration(migrations.Migration):
    dependencies = [
        ("organizations", "0005_brandingprofile_logo"),
    ]

    operations = [
        migrations.RunPython(
            normalize_malformed_tenant_domains,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
