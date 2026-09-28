from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0006_category_sale_tax_ids"),
    ]

    operations = [
        migrations.AddField(
            model_name="vendor",
            name="address",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="vendor",
            name="gst_number",
            field=models.CharField(blank=True, default="", max_length=30),
        ),
    ]
