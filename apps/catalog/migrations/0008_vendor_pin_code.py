from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0007_vendor_address_gst_number"),
    ]

    operations = [
        migrations.AddField(
            model_name="vendor",
            name="pin_code",
            field=models.CharField(blank=True, default="", max_length=10),
        ),
    ]
