from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("purchases", "0009_purchase_invoice_setting"),
    ]

    operations = [
        migrations.AddField(
            model_name="purchaseitem",
            name="list_price",
            field=models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=12),
        ),
        migrations.AddField(
            model_name="purchaseitem",
            name="discount_amount",
            field=models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=14),
        ),
        migrations.AddField(
            model_name="purchaseitem",
            name="tax_amount",
            field=models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=14),
        ),
    ]
