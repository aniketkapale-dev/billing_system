from django.db import migrations


def add_settings_barcode_tab(apps, schema_editor):
    BusinessUser = apps.get_model("business_users", "BusinessUser")
    source_tabs = {"stock-in", "settings-tax", "settings-invoice"}
    for member in BusinessUser.objects.all():
        tabs = list(member.allowed_tabs or [])
        if source_tabs.intersection(tabs) and "settings-barcode" not in tabs:
            tabs.append("settings-barcode")
            member.allowed_tabs = tabs
            member.save(update_fields=["allowed_tabs"])


class Migration(migrations.Migration):

    dependencies = [
        ("business_users", "0003_add_stock_in_vendors_tab"),
    ]

    operations = [
        migrations.RunPython(add_settings_barcode_tab, migrations.RunPython.noop),
    ]
