from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("customers", "0005_alter_customer_place_of_supply"),
    ]

    operations = [
        migrations.AddField(
            model_name="customer",
            name="company_mobile",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
    ]
