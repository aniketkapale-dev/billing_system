import django.db.models.deletion
from django.db import migrations, models


def migrate_vendor_names(apps, schema_editor):
    PurchaseInvoiceItem = apps.get_model("invoicing", "PurchaseInvoiceItem")
    Vendor = apps.get_model("catalog", "Vendor")

    for item in PurchaseInvoiceItem.objects.select_related("purchase_invoice").iterator():
        vendor_name = (getattr(item, "vendor_name_legacy", None) or "").strip()
        if not vendor_name:
            continue

        business_id = item.purchase_invoice.business_id
        vendor = Vendor.objects.filter(
            business_id=business_id,
            name=vendor_name,
            is_deleted=False,
        ).first()
        if not vendor:
            vendor = Vendor.objects.create(
                business_id=business_id,
                name=vendor_name,
            )
        item.vendor_id = vendor.id
        item.save(update_fields=["vendor_id"])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0005_vendor"),
        ("invoicing", "0004_purchase_invoice_item_vendor"),
    ]

    operations = [
        migrations.RenameField(
            model_name="purchaseinvoiceitem",
            old_name="vendor",
            new_name="vendor_name_legacy",
        ),
        migrations.AddField(
            model_name="purchaseinvoiceitem",
            name="vendor",
            field=models.ForeignKey(
                blank=True,
                db_column="vendor_id",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="purchase_invoice_items",
                to="catalog.vendor",
            ),
        ),
        migrations.RunPython(migrate_vendor_names, noop),
        migrations.RemoveField(
            model_name="purchaseinvoiceitem",
            name="vendor_name_legacy",
        ),
    ]
