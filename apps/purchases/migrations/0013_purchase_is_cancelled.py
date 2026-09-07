from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("purchases", "0012_purchase_is_paid"),
    ]

    operations = [
        migrations.AddField(
            model_name="purchase",
            name="is_cancelled",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="purchase",
            name="cancelled_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
