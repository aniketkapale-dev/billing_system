import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("businesses", "0002_backfill_business_data"),
        ("purchases", "0002_purchase_business"),
    ]

    operations = [
        migrations.AlterField(
            model_name="purchase",
            name="business",
            field=models.ForeignKey(
                db_column="business_id",
                on_delete=django.db.models.deletion.CASCADE,
                related_name="purchases",
                to="businesses.business",
            ),
        ),
    ]
