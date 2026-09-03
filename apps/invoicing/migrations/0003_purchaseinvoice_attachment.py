from django.db import migrations, models

import apps.invoicing.models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ("invoicing", "0002_batchconsumption_purchase_item_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="purchaseinvoice",
            name="attachment",
            field=models.FileField(
                blank=True,
                null=True,
                upload_to=apps.invoicing.models.purchase_invoice_upload_path,
                validators=[
                    django.core.validators.FileExtensionValidator(
                        allowed_extensions=["pdf", "jpg", "jpeg", "png", "webp", "gif"]
                    )
                ],
            ),
        ),
    ]
