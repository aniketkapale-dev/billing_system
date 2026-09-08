from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("purchases", "0015_purchase_cancellation_date"),
    ]

    operations = [
        migrations.AddField(
            model_name="purchase",
            name="is_draft",
            field=models.BooleanField(default=False),
        ),
    ]
