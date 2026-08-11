from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("customers", "0001_initial"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="customer",
            constraint=models.UniqueConstraint(
                fields=("business", "name"),
                condition=models.Q(is_deleted=False),
                name="uniq_active_business_customer_name",
            ),
        ),
    ]
