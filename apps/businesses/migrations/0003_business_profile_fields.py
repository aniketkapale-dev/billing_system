import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("businesses", "0002_backfill_business_data"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="business",
            name="uniq_active_owner_business_name",
        ),
        migrations.RenameField(
            model_name="business",
            old_name="name",
            new_name="business_name",
        ),
        migrations.AddField(
            model_name="business",
            name="address",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="business",
            name="email",
            field=models.EmailField(blank=True, default="", max_length=254),
        ),
        migrations.AddField(
            model_name="business",
            name="gst_number",
            field=models.CharField(blank=True, default="", max_length=30),
        ),
        migrations.AddField(
            model_name="business",
            name="logo",
            field=models.ImageField(blank=True, null=True, upload_to="business_logos/"),
        ),
        migrations.AddField(
            model_name="business",
            name="phone",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
        migrations.AddConstraint(
            model_name="business",
            constraint=models.UniqueConstraint(
                condition=models.Q(("is_deleted", False)),
                fields=("owner", "business_name"),
                name="uniq_active_owner_business_name",
            ),
        ),
    ]
