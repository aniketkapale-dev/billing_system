from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("businesses", "0004_business_state_code_pin_code"),
    ]

    operations = [
        migrations.AddField(
            model_name="business",
            name="data_revision",
            field=models.PositiveBigIntegerField(default=0),
        ),
    ]