from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0005_vendor"),
    ]

    operations = [
        migrations.AddField(
            model_name="category",
            name="sale_tax_ids",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
