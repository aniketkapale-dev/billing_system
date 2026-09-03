from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("products", "0010_product_actual_price"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="mrp",
            field=models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=12),
        ),
    ]
