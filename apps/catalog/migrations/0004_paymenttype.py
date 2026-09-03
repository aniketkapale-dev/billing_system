from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("businesses", "0003_business_profile_fields"),
        ("catalog", "0003_manufacturer"),
    ]

    operations = [
        migrations.CreateModel(
            name="PaymentType",
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
                ("name", models.CharField(max_length=100)),
                (
                    "business",
                    models.ForeignKey(
                        db_column="business_id",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="payment_types",
                        to="businesses.business",
                    ),
                ),
            ],
            options={
                "verbose_name": "Payment Type",
                "verbose_name_plural": "Payment Types",
                "db_table": "payment_types",
            },
        ),
        migrations.AddConstraint(
            model_name="paymenttype",
            constraint=models.UniqueConstraint(
                condition=models.Q(("is_deleted", False)),
                fields=("business", "name"),
                name="uniq_active_business_payment_type_name",
            ),
        ),
    ]
