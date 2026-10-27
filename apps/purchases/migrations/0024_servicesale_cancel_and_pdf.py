from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("purchases", "0023_servicesale"),
    ]

    operations = [
        migrations.AddField(
            model_name="servicesale",
            name="cancelled_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="servicesale",
            name="cancellation_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="servicesale",
            name="cancellation_reason",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="servicesale",
            name="invoice_pdf",
            field=models.FileField(blank=True, null=True, upload_to="service_sale_invoices/"),
        ),
    ]
