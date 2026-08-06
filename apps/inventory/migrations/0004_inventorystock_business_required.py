import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("businesses", "0002_backfill_business_data"),
        ("inventory", "0003_inventorystock_business"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="inventorystock",
            name="uniq_active_owner_product_stock",
        ),
        migrations.AlterField(
            model_name="inventorystock",
            name="business",
            field=models.ForeignKey(
                db_column="business_id",
                on_delete=django.db.models.deletion.CASCADE,
                related_name="inventory_stocks",
                to="businesses.business",
            ),
        ),
        migrations.AddConstraint(
            model_name="inventorystock",
            constraint=models.UniqueConstraint(
                condition=models.Q(("is_deleted", False)),
                fields=("business", "product"),
                name="uniq_active_business_product_stock",
            ),
        ),
    ]
