import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("businesses", "0002_backfill_business_data"),
        ("products", "0002_product_business"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="product",
            name="uniq_active_owner_product_sku",
        ),
        migrations.AlterField(
            model_name="product",
            name="business",
            field=models.ForeignKey(
                db_column="business_id",
                on_delete=django.db.models.deletion.CASCADE,
                related_name="products",
                to="businesses.business",
            ),
        ),
        migrations.AddConstraint(
            model_name="product",
            constraint=models.UniqueConstraint(
                condition=models.Q(("is_deleted", False), models.Q(("sku", ""), _negated=True)),
                fields=("business", "sku"),
                name="uniq_active_business_product_sku",
            ),
        ),
    ]
