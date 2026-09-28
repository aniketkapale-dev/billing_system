from django.db import migrations


def backfill_product_sale_tax_ids(apps, schema_editor):
    Category = apps.get_model("catalog", "Category")
    Product = apps.get_model("products", "Product")

    for category in Category.objects.filter(is_deleted=False):
        tax_ids = category.sale_tax_ids or []
        if not tax_ids:
            continue
        Product.objects.filter(
            category_id=category.id,
            is_deleted=False,
        ).update(sale_tax_ids=tax_ids)


class Migration(migrations.Migration):
    dependencies = [
        ("products", "0013_product_sale_tax_ids"),
        ("catalog", "0006_category_sale_tax_ids"),
    ]

    operations = [
        migrations.RunPython(backfill_product_sale_tax_ids, migrations.RunPython.noop),
    ]
