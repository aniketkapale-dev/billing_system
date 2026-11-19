import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("businesses", "0006_business_bank_details"),
        ("catalog", "0008_vendor_pin_code"),
    ]

    operations = [
        migrations.CreateModel(
            name="Service",
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
                ("name", models.CharField(max_length=150)),
                (
                    "business",
                    models.ForeignKey(
                        db_column="business_id",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="services",
                        to="businesses.business",
                    ),
                ),
            ],
            options={
                "verbose_name": "Service",
                "verbose_name_plural": "Services",
                "db_table": "services",
            },
        ),
        migrations.AddConstraint(
            model_name="service",
            constraint=models.UniqueConstraint(
                condition=models.Q(("is_deleted", False)),
                fields=("business", "name"),
                name="uniq_active_business_service_name",
            ),
        ),
    ]
