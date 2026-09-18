from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("purchases", "0019_saleduesetting"),
        ("settings", "0012_whatsappmessagesetting_default_due_days"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="whatsappmessagesetting",
            name="default_due_days_after_sale",
        ),
    ]
