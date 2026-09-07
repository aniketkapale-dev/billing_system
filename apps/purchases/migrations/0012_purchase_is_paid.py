from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("purchases", "0011_purchaseitem_sale_pricing_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="purchase",
            name="is_paid",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="purchase",
            name="paid_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
