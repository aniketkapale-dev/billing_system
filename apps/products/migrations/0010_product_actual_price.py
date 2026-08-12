from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("products", "0009_product_tax"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="actual_price",
            field=models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=12),
        ),
    ]
