from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("purchases", "0005_purchase_total_cost_purchase_total_profit_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="purchase",
            name="billing_address",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="purchase",
            name="shipping_address",
            field=models.TextField(blank=True, default=""),
        ),
    ]
