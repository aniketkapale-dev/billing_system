from django.db import migrations


def add_settings_barcode_tab(apps, schema_editor):
    Role = apps.get_model("roles", "Role")
    source_tabs = {"stock-in", "settings-tax", "settings-invoice"}
    for role in Role.objects.all():
        tabs = list(role.allowed_tabs or [])
        if source_tabs.intersection(tabs) and "settings-barcode" not in tabs:
            tabs.append("settings-barcode")
            role.allowed_tabs = tabs
            role.save(update_fields=["allowed_tabs"])


class Migration(migrations.Migration):

    dependencies = [
        ("roles", "0004_add_stock_in_vendors_tab"),
    ]

    operations = [
        migrations.RunPython(add_settings_barcode_tab, migrations.RunPython.noop),
    ]
