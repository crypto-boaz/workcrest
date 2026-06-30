import uuid

from django.db import migrations, models


def populate_qr_identifiers(apps, schema_editor):
    Product = apps.get_model("commerce", "Product")
    Sale = apps.get_model("commerce", "Sale")
    SaleItem = apps.get_model("commerce", "SaleItem")

    for product in Product.objects.filter(qr_identifier__isnull=True).iterator():
        product.qr_identifier = uuid.uuid4()
        product.save(update_fields=["qr_identifier"])

    for sale in Sale.objects.filter(receipt_qr_identifier__isnull=True).iterator():
        sale.receipt_qr_identifier = uuid.uuid4()
        sale.save(update_fields=["receipt_qr_identifier"])

    for sale_item in SaleItem.objects.filter(
        product_qr_identifier__isnull=True
    ).select_related("product").iterator():
        sale_item.product_qr_identifier = sale_item.product.qr_identifier
        sale_item.barcode = sale_item.product.barcode
        sale_item.save(update_fields=["product_qr_identifier", "barcode"])


class Migration(migrations.Migration):
    dependencies = [
        ("commerce", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="qr_identifier",
            field=models.UUIDField(editable=False, null=True),
        ),
        migrations.AddField(
            model_name="sale",
            name="receipt_qr_identifier",
            field=models.UUIDField(editable=False, null=True),
        ),
        migrations.AddField(
            model_name="saleitem",
            name="barcode",
            field=models.CharField(blank=True, default="", max_length=100),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="saleitem",
            name="product_qr_identifier",
            field=models.UUIDField(null=True),
        ),
        migrations.RunPython(populate_qr_identifiers, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="product",
            name="qr_identifier",
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
        ),
        migrations.AlterField(
            model_name="sale",
            name="receipt_qr_identifier",
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
        ),
        migrations.AlterField(
            model_name="saleitem",
            name="product_qr_identifier",
            field=models.UUIDField(),
        ),
    ]
