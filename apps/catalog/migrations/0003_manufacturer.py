from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("businesses", "0003_business_profile_fields"),
        ("catalog", "0002_unit_business_scoped"),
    ]

    operations = [
        migrations.CreateModel(
            name="Manufacturer",
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
                        related_name="manufacturers",
                        to="businesses.business",
                    ),
                ),
            ],
            options={
                "verbose_name": "Manufacturer",
                "verbose_name_plural": "Manufacturers",
                "db_table": "manufacturers",
            },
        ),
        migrations.AddConstraint(
            model_name="manufacturer",
            constraint=models.UniqueConstraint(
                condition=models.Q(("is_deleted", False)),
                fields=("business", "name"),
                name="uniq_active_business_manufacturer_name",
            ),
        ),
    ]
