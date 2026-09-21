from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("businesses", "0003_business_profile_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="business",
            name="state_code",
            field=models.CharField(blank=True, default="", max_length=2),
        ),
        migrations.AddField(
            model_name="business",
            name="pin_code",
            field=models.CharField(blank=True, default="", max_length=10),
        ),
    ]
