import django.db.models.deletion
from django.db import migrations, models


def migrate_global_units_to_business(apps, schema_editor):
    Unit = apps.get_model("catalog", "Unit")
    Product = apps.get_model("products", "Product")

    reassigned = {}

    for product in Product.objects.exclude(unit_id__isnull=True).iterator():
        old_unit = Unit.objects.filter(pk=product.unit_id).first()
        if not old_unit:
            continue

        if old_unit.business_id:
            if old_unit.business_id != product.business_id:
                key = (product.business_id, old_unit.short_name.lower())
                if key not in reassigned:
                    new_unit, _ = Unit.objects.get_or_create(
                        business_id=product.business_id,
                        short_name=old_unit.short_name,
                        defaults={
                            "name": old_unit.name,
                            "is_active": old_unit.is_active,
                            "is_deleted": False,
                        },
                    )
                    reassigned[key] = new_unit.id
                product.unit_id = reassigned[key]
                product.save(update_fields=["unit_id"])
            continue

        key = (product.business_id, old_unit.short_name.lower())
        if key not in reassigned:
            new_unit, _ = Unit.objects.get_or_create(
                business_id=product.business_id,
                short_name=old_unit.short_name,
                defaults={
                    "name": old_unit.name,
                    "is_active": old_unit.is_active,
                    "is_deleted": False,
                },
            )
            reassigned[key] = new_unit.id
        product.unit_id = reassigned[key]
        product.save(update_fields=["unit_id"])

    Unit.objects.filter(business_id__isnull=True).delete()


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("businesses", "0002_backfill_business_data"),
        ("catalog", "0001_initial"),
        ("products", "0004_product_barcode_product_brand_product_category_and_more"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="unit",
            name="uniq_active_unit_name",
        ),
        migrations.RemoveConstraint(
            model_name="unit",
            name="uniq_active_unit_short_name",
        ),
        migrations.AddField(
            model_name="unit",
            name="business",
            field=models.ForeignKey(
                blank=True,
                db_column="business_id",
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="units",
                to="businesses.business",
            ),
        ),
        migrations.RunPython(migrate_global_units_to_business, noop),
        migrations.AlterField(
            model_name="unit",
            name="business",
            field=models.ForeignKey(
                db_column="business_id",
                on_delete=django.db.models.deletion.CASCADE,
                related_name="units",
                to="businesses.business",
            ),
        ),
        migrations.AddConstraint(
            model_name="unit",
            constraint=models.UniqueConstraint(
                condition=models.Q(("is_deleted", False)),
                fields=("business", "name"),
                name="uniq_active_business_unit_name",
            ),
        ),
        migrations.AddConstraint(
            model_name="unit",
            constraint=models.UniqueConstraint(
                condition=models.Q(("is_deleted", False)),
                fields=("business", "short_name"),
                name="uniq_active_business_unit_short_name",
            ),
        ),
    ]
