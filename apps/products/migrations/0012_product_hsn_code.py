from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("products", "0011_product_mrp"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="hsn_code",
            field=models.CharField(blank=True, default="", max_length=8),
        ),
    ]
