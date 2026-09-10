from decimal import Decimal

from django.db import migrations, models


def backfill_batch_mrp(apps, schema_editor):
    InventoryBatch = apps.get_model("invoicing", "InventoryBatch")
    for batch in InventoryBatch.objects.select_related("product").iterator():
        if Decimal(str(batch.mrp or 0)) > 0:
            continue
        product = batch.product
        if not product:
            continue
        batch.mrp = Decimal(str(product.mrp or batch.selling_price or 0))
        batch.save(update_fields=["mrp"])


class Migration(migrations.Migration):

    dependencies = [
        ("invoicing", "0005_purchase_invoice_item_vendor_fk"),
    ]

    operations = [
        migrations.AddField(
            model_name="inventorybatch",
            name="mrp",
            field=models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=12),
        ),
        migrations.RunPython(backfill_batch_mrp, migrations.RunPython.noop),
    ]
