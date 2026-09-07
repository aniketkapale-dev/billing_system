from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("purchases", "0013_purchase_is_cancelled"),
    ]

    operations = [
        migrations.AddField(
            model_name="purchase",
            name="cancellation_reason",
            field=models.TextField(blank=True, default=""),
        ),
    ]
