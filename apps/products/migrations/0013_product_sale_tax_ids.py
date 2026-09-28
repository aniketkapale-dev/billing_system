from django.db import migrations, models


def ensure_product_sale_tax_ids_column(apps, schema_editor):
    connection = schema_editor.connection
    with connection.cursor() as cursor:
        if connection.vendor == "sqlite":
            cursor.execute("PRAGMA table_info(products)")
            columns = {row[1] for row in cursor.fetchall()}
            if "sale_tax_ids" not in columns:
                cursor.execute(
                    "ALTER TABLE products ADD COLUMN sale_tax_ids TEXT NOT NULL DEFAULT '[]'"
                )
            else:
                cursor.execute(
                    "UPDATE products SET sale_tax_ids = '[]' "
                    "WHERE sale_tax_ids IS NULL OR sale_tax_ids = ''"
                )
            return

        cursor.execute(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = 'products' AND column_name = 'sale_tax_ids'
            """
        )
        if cursor.fetchone():
            cursor.execute(
                "UPDATE products SET sale_tax_ids = '[]'::jsonb "
                "WHERE sale_tax_ids IS NULL"
            )
            return

        cursor.execute(
            "ALTER TABLE products ADD COLUMN sale_tax_ids JSONB NOT NULL DEFAULT '[]'::jsonb"
        )


class Migration(migrations.Migration):

    dependencies = [
        ("products", "0012_product_hsn_code"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name="product",
                    name="sale_tax_ids",
                    field=models.JSONField(blank=True, default=list),
                ),
            ],
            database_operations=[
                migrations.RunPython(
                    ensure_product_sale_tax_ids_column,
                    migrations.RunPython.noop,
                ),
            ],
        ),
    ]
