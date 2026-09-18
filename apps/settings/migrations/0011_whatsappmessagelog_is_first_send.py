from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("settings", "0010_whatsappmessagelog"),
    ]

    operations = [
        migrations.AddField(
            model_name="whatsappmessagelog",
            name="is_first_send",
            field=models.BooleanField(default=True),
        ),
    ]
