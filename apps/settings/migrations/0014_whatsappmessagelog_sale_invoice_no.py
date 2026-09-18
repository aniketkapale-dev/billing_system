from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("purchases", "0019_saleduesetting"),
        ("settings", "0013_remove_whatsappmessagesetting_default_due_days"),
    ]

    operations = [
        migrations.AddField(
            model_name="whatsappmessagelog",
            name="invoice_no",
            field=models.CharField(blank=True, default="", max_length=50),
        ),
        migrations.AddField(
            model_name="whatsappmessagelog",
            name="sale",
            field=models.ForeignKey(
                blank=True,
                db_column="sale_id",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="whatsapp_message_logs",
                to="purchases.purchase",
            ),
        ),
    ]
