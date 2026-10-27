import django.db.models.deletion
import django.utils.timezone
from decimal import Decimal
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("businesses", "0006_business_bank_details"),
        ("catalog", "0009_service"),
        ("customers", "0007_customer_pin_code"),
        ("purchases", "0022_purchaseitem_gst_rate"),
        ("settings", "0014_whatsappmessagelog_sale_invoice_no"),
        ("users", "0003_user_approved_at"),
    ]

    operations = [
        migrations.CreateModel(
            name="ServiceSale",
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
                ("customer_name", models.CharField(max_length=150)),
                ("reference_no", models.CharField(blank=True, default="", max_length=50)),
                ("sale_date", models.DateField(default=django.utils.timezone.localdate)),
                ("notes", models.TextField(blank=True, default="")),
                ("terms", models.TextField(blank=True, default="")),
                ("total_amount", models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=14)),
                ("is_paid", models.BooleanField(default=False)),
                ("paid_at", models.DateTimeField(blank=True, null=True)),
                ("due_date", models.DateField(blank=True, null=True)),
                ("is_draft", models.BooleanField(default=False)),
                ("is_cancelled", models.BooleanField(default=False)),
                (
                    "business",
                    models.ForeignKey(
                        db_column="business_id",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="service_sales",
                        to="businesses.business",
                    ),
                ),
                (
                    "customer",
                    models.ForeignKey(
                        blank=True,
                        db_column="customer_id",
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="service_sales",
                        to="customers.customer",
                    ),
                ),
                (
                    "invoice_setting",
                    models.ForeignKey(
                        blank=True,
                        db_column="invoice_setting_id",
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="service_sales",
                        to="settings.invoicesetting",
                    ),
                ),
                (
                    "owner",
                    models.ForeignKey(
                        db_column="owner_id",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="service_sales",
                        to="users.user",
                    ),
                ),
                (
                    "payment_type",
                    models.ForeignKey(
                        blank=True,
                        db_column="payment_type_id",
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="service_sales",
                        to="catalog.paymenttype",
                    ),
                ),
            ],
            options={
                "verbose_name": "Service Sale",
                "verbose_name_plural": "Service Sales",
                "db_table": "service_sales",
                "ordering": ("-sale_date", "-created_at"),
            },
        ),
        migrations.CreateModel(
            name="ServiceSaleItem",
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
                ("base_price", models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=12)),
                ("sale_tax_ids", models.JSONField(blank=True, default=list)),
                ("tax_amount", models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=14)),
                ("gst_rate", models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=6, null=True)),
                ("line_total", models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=14)),
                (
                    "service",
                    models.ForeignKey(
                        db_column="service_id",
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="service_sale_items",
                        to="catalog.service",
                    ),
                ),
                (
                    "service_sale",
                    models.ForeignKey(
                        db_column="service_sale_id",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="items",
                        to="purchases.servicesale",
                    ),
                ),
            ],
            options={
                "verbose_name": "Service Sale Item",
                "verbose_name_plural": "Service Sale Items",
                "db_table": "service_sale_items",
            },
        ),
        migrations.CreateModel(
            name="ServiceSalePayment",
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
                ("amount", models.DecimalField(decimal_places=2, max_digits=14)),
                ("payment_date", models.DateField(default=django.utils.timezone.localdate)),
                ("next_due_date", models.DateField(blank=True, null=True)),
                ("notes", models.TextField(blank=True, default="")),
                (
                    "payment_type",
                    models.ForeignKey(
                        blank=True,
                        db_column="payment_type_id",
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="service_sale_payments",
                        to="catalog.paymenttype",
                    ),
                ),
                (
                    "service_sale",
                    models.ForeignKey(
                        db_column="service_sale_id",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="payments",
                        to="purchases.servicesale",
                    ),
                ),
            ],
            options={
                "verbose_name": "Service Sale Payment",
                "verbose_name_plural": "Service Sale Payments",
                "db_table": "service_sale_payments",
                "ordering": ("payment_date", "created_at"),
            },
        ),
    ]
