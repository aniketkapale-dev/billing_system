from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("customers", "0003_customer_business_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="customer",
            name="place_of_supply",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
    ]
