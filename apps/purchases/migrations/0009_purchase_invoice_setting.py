import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("settings", "0006_invoicesetting_terms_qr"),
        ("purchases", "0008_purchase_customer"),
    ]

    operations = [
        migrations.AddField(
            model_name="purchase",
            name="invoice_setting",
            field=models.ForeignKey(
                blank=True,
                db_column="invoice_setting_id",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="purchases",
                to="settings.invoicesetting",
            ),
        ),
    ]
