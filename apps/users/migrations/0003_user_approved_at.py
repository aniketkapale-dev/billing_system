from django.db import migrations, models
from django.db.models import F


def backfill_approved_at(apps, schema_editor):
    User = apps.get_model("users", "User")
    User.objects.filter(is_active=True, approved_at__isnull=True).update(
        approved_at=F("updated_at")
    )


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0002_user_email_optional"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="approved_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(backfill_approved_at, migrations.RunPython.noop),
    ]
