import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0003_manufacturer"),
        ("products", "0007_product_purchase_price_sale_price"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="manufacturer",
            field=models.ForeignKey(
                blank=True,
                db_column="manufacturer_id",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="products",
                to="catalog.manufacturer",
            ),
        ),
    ]
