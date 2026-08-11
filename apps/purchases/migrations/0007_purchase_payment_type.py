from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0004_paymenttype"),
        ("purchases", "0006_purchase_billing_address_purchase_shipping_address"),
    ]

    operations = [
        migrations.AddField(
            model_name="purchase",
            name="payment_type",
            field=models.ForeignKey(
                blank=True,
                db_column="payment_type_id",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="purchases",
                to="catalog.paymenttype",
            ),
        ),
    ]
