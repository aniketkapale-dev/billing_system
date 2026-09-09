import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("businesses", "0001_initial"),
        ("products", "0001_initial"),
        ("settings", "0006_invoicesetting_terms_qr"),
    ]

    operations = [
        migrations.CreateModel(
            name="ProductBarcode",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("deleted_at", models.DateTimeField(blank=True, null=True)),
                ("created_by", models.BigIntegerField(blank=True, null=True)),
                ("updated_by", models.BigIntegerField(blank=True, null=True)),
                ("deleted_by", models.BigIntegerField(blank=True, null=True)),
                ("created_ip", models.GenericIPAddressField(blank=True, null=True)),
                ("updated_ip", models.GenericIPAddressField(blank=True, null=True)),
                ("deleted_ip", models.GenericIPAddressField(blank=True, null=True)),
                ("is_active", models.BooleanField(default=True)),
                ("is_deleted", models.BooleanField(default=False)),
                ("value", models.CharField(max_length=100)),
                ("model_label", models.CharField(blank=True, default="", max_length=100)),
                (
                    "business",
                    models.ForeignKey(
                        db_column="business_id",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="product_barcodes",
                        to="businesses.business",
                    ),
                ),
                (
                    "product",
                    models.ForeignKey(
                        db_column="product_id",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="barcode_entries",
                        to="products.product",
                    ),
                ),
            ],
            options={
                "verbose_name": "Product Barcode",
                "verbose_name_plural": "Product Barcodes",
                "db_table": "product_barcodes",
                "ordering": ("product__name", "value"),
            },
        ),
        migrations.AddConstraint(
            model_name="productbarcode",
            constraint=models.UniqueConstraint(
                condition=models.Q(("is_deleted", False)),
                fields=("business", "value"),
                name="uniq_active_business_product_barcode_value",
            ),
        ),
    ]
