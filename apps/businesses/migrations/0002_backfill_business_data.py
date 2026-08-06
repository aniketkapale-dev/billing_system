from django.db import migrations


def create_default_businesses(apps, schema_editor):
    User = apps.get_model("users", "User")
    Business = apps.get_model("businesses", "Business")
    Product = apps.get_model("products", "Product")
    InventoryStock = apps.get_model("inventory", "InventoryStock")
    Purchase = apps.get_model("purchases", "Purchase")

    owner_ids = set()
    owner_ids.update(Product.objects.exclude(owner_id__isnull=True).values_list("owner_id", flat=True))
    owner_ids.update(InventoryStock.objects.exclude(owner_id__isnull=True).values_list("owner_id", flat=True))
    owner_ids.update(Purchase.objects.exclude(owner_id__isnull=True).values_list("owner_id", flat=True))

    business_by_owner = {}
    for owner_id in owner_ids:
        user = User.objects.filter(pk=owner_id).first()
        label = (user.full_name.strip() if user and user.full_name else f"Business {owner_id}")
        if not label:
            label = f"Business {owner_id}"
        business = Business.objects.create(owner_id=owner_id, name=f"{label} Store")
        business_by_owner[owner_id] = business.id

    for product in Product.objects.filter(business_id__isnull=True):
        business_id = business_by_owner.get(product.owner_id)
        if business_id:
            product.business_id = business_id
            product.save(update_fields=["business_id"])

    for stock in InventoryStock.objects.filter(business_id__isnull=True):
        business_id = business_by_owner.get(stock.owner_id)
        if business_id:
            stock.business_id = business_id
            stock.save(update_fields=["business_id"])

    for purchase in Purchase.objects.filter(business_id__isnull=True):
        business_id = business_by_owner.get(purchase.owner_id)
        if business_id:
            purchase.business_id = business_id
            purchase.save(update_fields=["business_id"])


class Migration(migrations.Migration):

    dependencies = [
        ("businesses", "0001_initial"),
        ("products", "0002_product_business"),
        ("inventory", "0003_inventorystock_business"),
        ("purchases", "0002_purchase_business"),
    ]

    operations = [
        migrations.RunPython(create_default_businesses, migrations.RunPython.noop),
    ]
