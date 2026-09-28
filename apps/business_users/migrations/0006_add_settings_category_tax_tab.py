from django.db import migrations


def add_settings_category_tax_tab(apps, schema_editor):
    BusinessUser = apps.get_model("business_users", "BusinessUser")
    source_tabs = {"settings-tax", "settings-invoice", "settings-barcode", "settings-whatsapp"}
    for member in BusinessUser.objects.all():
        tabs = list(member.allowed_tabs or [])
        if source_tabs.intersection(tabs) and "settings-category-tax" not in tabs:
            tabs.append("settings-category-tax")
            member.allowed_tabs = tabs
            member.save(update_fields=["allowed_tabs"])


class Migration(migrations.Migration):

    dependencies = [
        ("business_users", "0005_add_settings_whatsapp_tab"),
    ]

    operations = [
        migrations.RunPython(add_settings_category_tax_tab, migrations.RunPython.noop),
    ]
