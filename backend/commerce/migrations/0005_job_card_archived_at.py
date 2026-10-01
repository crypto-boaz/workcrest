from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("commerce", "0004_job_cards"),
    ]

    operations = [
        migrations.AddField(
            model_name="jobcard",
            name="archived_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
