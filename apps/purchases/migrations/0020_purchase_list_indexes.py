from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("purchases", "0019_saleduesetting"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="purchase",
            index=models.Index(
                fields=["business", "is_deleted", "is_draft", "purchase_date"],
                name="idx_purch_biz_status_date",
            ),
        ),
        migrations.AddIndex(
            model_name="purchase",
            index=models.Index(
                fields=["business", "reference_no"],
                name="idx_purch_biz_reference",
            ),
        ),
        migrations.AddIndex(
            model_name="purchase",
            index=models.Index(
                fields=["business", "customer_name"],
                name="idx_purch_biz_customer",
            ),
        ),
    ]
