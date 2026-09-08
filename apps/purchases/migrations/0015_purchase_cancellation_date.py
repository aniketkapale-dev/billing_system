from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("purchases", "0014_purchase_cancellation_reason"),
    ]

    operations = [
        migrations.AddField(
            model_name="purchase",
            name="cancellation_date",
            field=models.DateField(blank=True, null=True),
        ),
    ]
