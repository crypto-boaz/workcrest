from django.db import migrations, models
import organizations.models


class Migration(migrations.Migration):
    dependencies = [
        ("organizations", "0004_rename_workcrest_platform_domains"),
    ]

    operations = [
        migrations.AddField(
            model_name="brandingprofile",
            name="logo",
            field=models.FileField(
                blank=True,
                upload_to=organizations.models.branding_logo_path,
            ),
        ),
    ]
