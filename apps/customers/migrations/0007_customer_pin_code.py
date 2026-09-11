from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("customers", "0006_customer_company_mobile"),
    ]

    operations = [
        migrations.AddField(
            model_name="customer",
            name="pin_code",
            field=models.CharField(blank=True, default="", max_length=10),
        ),
    ]
