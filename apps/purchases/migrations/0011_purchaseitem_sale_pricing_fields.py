from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("purchases", "0010_purchaseitem_print_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="purchaseitem",
            name="discount_type",
            field=models.CharField(default="percent", max_length=10),
        ),
        migrations.AddField(
            model_name="purchaseitem",
            name="discount_value",
            field=models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=12),
        ),
        migrations.AddField(
            model_name="purchaseitem",
            name="distributor_discount_type",
            field=models.CharField(default="percent", max_length=10),
        ),
        migrations.AddField(
            model_name="purchaseitem",
            name="distributor_discount_value",
            field=models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=12),
        ),
        migrations.AddField(
            model_name="purchaseitem",
            name="sale_tax_ids",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
