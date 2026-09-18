from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("settings", "0011_whatsappmessagelog_is_first_send"),
    ]

    operations = [
        migrations.AddField(
            model_name="whatsappmessagesetting",
            name="default_due_days_after_sale",
            field=models.PositiveIntegerField(
                default=7,
                help_text="Default payment due days after sale date when invoice due date is not set.",
            ),
        ),
    ]
