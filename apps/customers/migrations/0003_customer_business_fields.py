from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("customers", "0002_customer_unique_name"),
    ]

    operations = [
        migrations.AddField(
            model_name="customer",
            name="company_name",
            field=models.CharField(blank=True, default="", max_length=150),
        ),
        migrations.AddField(
            model_name="customer",
            name="business_address",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="customer",
            name="shipping_address",
            field=models.TextField(blank=True, default=""),
        ),
    ]
