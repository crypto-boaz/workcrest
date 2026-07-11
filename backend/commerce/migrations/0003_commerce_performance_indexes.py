from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("commerce", "0002_product_and_receipt_qr_identifiers"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="sale",
            index=models.Index(
                fields=["organization", "location", "status", "-completed_at"],
                name="comm_sale_status_time_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="sale",
            index=models.Index(
                fields=["organization", "location", "-completed_at"],
                name="comm_sale_time_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="customerledgerentry",
            index=models.Index(
                fields=["organization", "location", "kind"],
                name="comm_cust_ledger_kind_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="customerledgerentry",
            index=models.Index(
                fields=["organization", "location", "-created_at"],
                name="comm_cust_ledger_time_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="supplierledgerentry",
            index=models.Index(
                fields=["organization", "location", "kind"],
                name="comm_supp_ledger_kind_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="supplierledgerentry",
            index=models.Index(
                fields=["organization", "location", "-created_at"],
                name="comm_supp_ledger_time_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="expense",
            index=models.Index(
                fields=["organization", "location", "-incurred_at"],
                name="comm_expense_time_idx",
            ),
        ),
        migrations.AlterModelOptions(
            name="expense",
            options={"ordering": ["-incurred_at"]},
        ),
    ]
