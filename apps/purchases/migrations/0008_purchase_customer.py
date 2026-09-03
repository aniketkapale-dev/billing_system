import django.db.models.deletion
from django.db import migrations, models


def backfill_customers(apps, schema_editor):
    Purchase = apps.get_model("purchases", "Purchase")
    Customer = apps.get_model("customers", "Customer")

    for purchase in Purchase.objects.filter(is_deleted=False).exclude(customer_name=""):
        name = (purchase.customer_name or "").strip()
        if not name:
            continue
        customer, _created = Customer.objects.get_or_create(
            business_id=purchase.business_id,
            name=name,
            is_deleted=False,
            defaults={"is_active": True},
        )
        if purchase.customer_id is None:
            purchase.customer_id = customer.id
            purchase.save(update_fields=["customer_id"])


class Migration(migrations.Migration):

    dependencies = [
        ("customers", "0002_customer_unique_name"),
        ("purchases", "0007_purchase_payment_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="purchase",
            name="customer",
            field=models.ForeignKey(
                blank=True,
                db_column="customer_id",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="purchases",
                to="customers.customer",
            ),
        ),
        migrations.RunPython(backfill_customers, migrations.RunPython.noop),
    ]
