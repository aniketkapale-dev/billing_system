from django.db import migrations


def add_stock_in_vendors_tab(apps, schema_editor):
    Role = apps.get_model("roles", "Role")
    for role in Role.objects.all():
        tabs = list(role.allowed_tabs or [])
        if "stock-in" in tabs and "stock-in-vendors" not in tabs:
            tabs.append("stock-in-vendors")
            role.allowed_tabs = tabs
            role.save(update_fields=["allowed_tabs"])


class Migration(migrations.Migration):

    dependencies = [
        ("roles", "0003_role_allowed_tabs"),
    ]

    operations = [
        migrations.RunPython(add_stock_in_vendors_tab, migrations.RunPython.noop),
    ]
