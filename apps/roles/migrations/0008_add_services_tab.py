from django.db import migrations


def add_services_tab(apps, schema_editor):
    Role = apps.get_model("roles", "Role")
    source_tabs = {"products", "products-units", "products-categories", "products-brands"}
    for role in Role.objects.all():
        tabs = list(role.allowed_tabs or [])
        if source_tabs.intersection(tabs) and "services" not in tabs:
            tabs.append("services")
            role.allowed_tabs = tabs
            role.save(update_fields=["allowed_tabs"])


class Migration(migrations.Migration):

    dependencies = [
        ("roles", "0007_add_settings_category_tax_tab"),
    ]

    operations = [
        migrations.RunPython(add_services_tab, migrations.RunPython.noop),
    ]
