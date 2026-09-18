from django.db import migrations, models


def copy_whatsapp_due_settings(apps, schema_editor):
    SaleDueSetting = apps.get_model("purchases", "SaleDueSetting")
    WhatsAppMessageSetting = apps.get_model("settings", "WhatsAppMessageSetting")

    for whatsapp_setting in WhatsAppMessageSetting.objects.filter(is_deleted=False):
        SaleDueSetting.objects.get_or_create(
            business_id=whatsapp_setting.business_id,
            defaults={
                "default_due_days_after_sale": whatsapp_setting.default_due_days_after_sale,
                "is_active": True,
            },
        )


class Migration(migrations.Migration):

    dependencies = [
        ("businesses", "0001_initial"),
        ("settings", "0012_whatsappmessagesetting_default_due_days"),
        ("purchases", "0018_purchasepayment"),
    ]

    operations = [
        migrations.CreateModel(
            name="SaleDueSetting",
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
                (
                    "default_due_days_after_sale",
                    models.PositiveIntegerField(
                        default=7,
                        help_text="Default payment due days after sale date when due date is not entered.",
                    ),
                ),
                (
                    "business",
                    models.ForeignKey(
                        db_column="business_id",
                        on_delete=models.deletion.CASCADE,
                        related_name="sale_due_settings",
                        to="businesses.business",
                    ),
                ),
            ],
            options={
                "verbose_name": "Sale Due Setting",
                "verbose_name_plural": "Sale Due Settings",
                "db_table": "sale_due_settings",
            },
        ),
        migrations.AddConstraint(
            model_name="saleduesetting",
            constraint=models.UniqueConstraint(
                condition=models.Q(("is_deleted", False)),
                fields=("business",),
                name="uniq_active_business_sale_due_setting",
            ),
        ),
        migrations.RunPython(copy_whatsapp_due_settings, migrations.RunPython.noop),
    ]
