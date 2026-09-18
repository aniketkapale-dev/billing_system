from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("businesses", "0001_initial"),
        ("customers", "0001_initial"),
        ("settings", "0009_whatsappmessagesetting"),
    ]

    operations = [
        migrations.CreateModel(
            name="WhatsAppMessageLog",
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
                ("customer_name", models.CharField(max_length=255)),
                ("mobile", models.CharField(blank=True, default="", max_length=20)),
                (
                    "total_amount",
                    models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=14),
                ),
                (
                    "pending_amount",
                    models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=14),
                ),
                ("first_message_sent_at", models.DateField()),
                ("sent_at", models.DateTimeField()),
                (
                    "business",
                    models.ForeignKey(
                        db_column="business_id",
                        on_delete=models.deletion.CASCADE,
                        related_name="whatsapp_message_logs",
                        to="businesses.business",
                    ),
                ),
                (
                    "customer",
                    models.ForeignKey(
                        blank=True,
                        db_column="customer_id",
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="whatsapp_message_logs",
                        to="customers.customer",
                    ),
                ),
            ],
            options={
                "verbose_name": "WhatsApp Message Log",
                "verbose_name_plural": "WhatsApp Message Logs",
                "db_table": "whatsapp_message_logs",
                "ordering": ("-sent_at", "-created_at"),
            },
        ),
    ]
