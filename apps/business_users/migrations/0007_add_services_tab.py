from django.db import migrations


def add_services_tab(apps, schema_editor):
    BusinessUser = apps.get_model("business_users", "BusinessUser")
    source_tabs = {"products", "products-units", "products-categories", "products-brands"}
    for member in BusinessUser.objects.all():
        tabs = list(member.allowed_tabs or [])
        if source_tabs.intersection(tabs) and "services" not in tabs:
            tabs.append("services")
            member.allowed_tabs = tabs
            member.save(update_fields=["allowed_tabs"])


class Migration(migrations.Migration):

    dependencies = [
        ("business_users", "0006_add_settings_category_tax_tab"),
    ]

    operations = [
        migrations.RunPython(add_services_tab, migrations.RunPython.noop),
    ]
