from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("purchases", "0020_purchase_list_indexes"),
    ]

    operations = [
        migrations.AddField(
            model_name="purchase",
            name="invoice_pdf",
            field=models.FileField(blank=True, null=True, upload_to="sale_invoices/"),
        ),
    ]
