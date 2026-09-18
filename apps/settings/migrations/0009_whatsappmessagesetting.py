from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("businesses", "0001_initial"),
        ("settings", "0008_alter_productbarcode_product"),
    ]

    operations = [
        migrations.CreateModel(
            name="WhatsAppMessageSetting",
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
                    "first_message_after_days",
                    models.PositiveIntegerField(
                        default=1,
                        help_text="Days after sale date to send the first reminder.",
                    ),
                ),
                (
                    "repeat_every_days",
                    models.PositiveIntegerField(
                        default=7,
                        help_text="Days after the first message to repeat reminders.",
                    ),
                ),
                (
                    "business",
                    models.ForeignKey(
                        db_column="business_id",
                        on_delete=models.deletion.CASCADE,
                        related_name="whatsapp_message_settings",
                        to="businesses.business",
                    ),
                ),
            ],
            options={
                "verbose_name": "WhatsApp Message Setting",
                "verbose_name_plural": "WhatsApp Message Settings",
                "db_table": "whatsapp_message_settings",
            },
        ),
        migrations.AddConstraint(
            model_name="whatsappmessagesetting",
            constraint=models.UniqueConstraint(
                condition=models.Q(("is_deleted", False)),
                fields=("business",),
                name="uniq_active_business_whatsapp_message_setting",
            ),
        ),
    ]
