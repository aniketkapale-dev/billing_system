from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("settings", "0003_invoicesetting_end_counter_and_more"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="invoicesetting",
            name="uniq_active_business_invoice_setting_year",
        ),
        migrations.AddConstraint(
            model_name="invoicesetting",
            constraint=models.UniqueConstraint(
                condition=models.Q(("is_deleted", False)),
                fields=("business", "year", "prefix", "suffix"),
                name="uniq_active_business_invoice_setting_series",
            ),
        ),
    ]
