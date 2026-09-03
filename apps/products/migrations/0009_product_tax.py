import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("settings", "0003_invoicesetting_end_counter_and_more"),
        ("products", "0008_product_manufacturer"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="tax",
            field=models.ForeignKey(
                blank=True,
                db_column="tax_id",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="products",
                to="settings.tax",
            ),
        ),
    ]
