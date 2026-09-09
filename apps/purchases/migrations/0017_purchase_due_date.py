from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("purchases", "0016_purchase_is_draft"),
    ]

    operations = [
        migrations.AddField(
            model_name="purchase",
            name="due_date",
            field=models.DateField(blank=True, null=True),
        ),
    ]
