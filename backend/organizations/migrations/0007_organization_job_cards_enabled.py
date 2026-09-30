from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("organizations", "0006_normalize_malformed_tenant_domains")]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="job_cards_enabled",
            field=models.BooleanField(default=False),
        ),
    ]
