from django.db import migrations


def add_stock_in_vendors_tab(apps, schema_editor):
    BusinessUser = apps.get_model("business_users", "BusinessUser")
    for member in BusinessUser.objects.all():
        tabs = list(member.allowed_tabs or [])
        if "stock-in" in tabs and "stock-in-vendors" not in tabs:
            tabs.append("stock-in-vendors")
            member.allowed_tabs = tabs
            member.save(update_fields=["allowed_tabs"])


class Migration(migrations.Migration):

    dependencies = [
        ("business_users", "0002_business_user_allowed_tabs"),
    ]

    operations = [
        migrations.RunPython(add_stock_in_vendors_tab, migrations.RunPython.noop),
    ]
