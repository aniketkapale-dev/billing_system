from django.db import migrations


def add_settings_category_tax_tab(apps, schema_editor):
    Role = apps.get_model("roles", "Role")
    source_tabs = {"settings-tax", "settings-invoice", "settings-barcode", "settings-whatsapp"}
    for role in Role.objects.all():
        tabs = list(role.allowed_tabs or [])
        if source_tabs.intersection(tabs) and "settings-category-tax" not in tabs:
            tabs.append("settings-category-tax")
            role.allowed_tabs = tabs
            role.save(update_fields=["allowed_tabs"])


class Migration(migrations.Migration):

    dependencies = [
        ("roles", "0006_add_settings_whatsapp_tab"),
    ]

    operations = [
        migrations.RunPython(add_settings_category_tax_tab, migrations.RunPython.noop),
    ]
