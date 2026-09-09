import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("products", "0004_product_barcode_product_brand_product_category_and_more"),
        ("settings", "0007_productbarcode"),
    ]

    operations = [
        migrations.AlterField(
            model_name="productbarcode",
            name="product",
            field=models.ForeignKey(
                blank=True,
                db_column="product_id",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="barcode_entries",
                to="products.product",
            ),
        ),
    ]
