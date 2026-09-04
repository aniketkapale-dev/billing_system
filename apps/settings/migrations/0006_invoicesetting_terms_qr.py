from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("settings", "0005_invoice_setting_counter_default_one"),
    ]

    operations = [
        migrations.AddField(
            model_name="invoicesetting",
            name="terms_conditions",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="invoicesetting",
            name="qr_image",
            field=models.ImageField(blank=True, null=True, upload_to="invoice_qr/"),
        ),
    ]
