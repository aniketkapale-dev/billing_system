from django.db import migrations, models


def copy_supplier_to_customer(apps, schema_editor):
    Purchase = apps.get_model("purchases", "Purchase")
    for purchase in Purchase.objects.all():
        if purchase.supplier_name:
            purchase.customer_name = purchase.supplier_name
            purchase.save(update_fields=["customer_name"])


class Migration(migrations.Migration):

    dependencies = [
        ("purchases", "0003_purchase_business_required"),
    ]

    operations = [
        migrations.AddField(
            model_name="purchase",
            name="customer_name",
            field=models.CharField(blank=True, default="", max_length=150),
        ),
        migrations.RunPython(copy_supplier_to_customer, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="purchase",
            name="customer_name",
            field=models.CharField(max_length=150),
        ),
        migrations.AlterField(
            model_name="purchase",
            name="supplier_name",
            field=models.CharField(blank=True, default="", max_length=150),
        ),
    ]
