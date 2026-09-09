from django.db import migrations, models


def backfill_place_of_supply(apps, schema_editor):
    Customer = apps.get_model("customers", "Customer")
    Customer.objects.filter(place_of_supply__isnull=True).update(place_of_supply="")


class Migration(migrations.Migration):

    dependencies = [
        ("customers", "0004_customer_place_of_supply"),
    ]

    operations = [
        migrations.RunPython(backfill_place_of_supply, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="customer",
            name="place_of_supply",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
    ]
