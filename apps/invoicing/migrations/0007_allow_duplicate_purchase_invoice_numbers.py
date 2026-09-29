from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("invoicing", "0006_inventorybatch_mrp"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="purchaseinvoice",
            name="uniq_active_business_purchase_invoice_no",
        ),
    ]
