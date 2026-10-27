from django.db import migrations, models


def _column_exists(cursor, table_name, column_name, vendor):
    if vendor == "sqlite":
        cursor.execute(f"PRAGMA table_info({table_name})")
        return column_name in {row[1] for row in cursor.fetchall()}

    if vendor == "mysql":
        cursor.execute(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = %s
              AND column_name = %s
            """,
            [table_name, column_name],
        )
        return cursor.fetchone() is not None

    if vendor == "postgresql":
        cursor.execute(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = %s
              AND column_name = %s
            """,
            [table_name, column_name],
        )
        return cursor.fetchone() is not None

    raise NotImplementedError(
        f"Unsupported database vendor for sale_tax_ids migration: {vendor}"
    )


def ensure_product_sale_tax_ids_column(apps, schema_editor):
    connection = schema_editor.connection
    vendor = connection.vendor
    table_name = "products"
    column_name = "sale_tax_ids"

    with connection.cursor() as cursor:
        if vendor == "sqlite":
            if not _column_exists(cursor, table_name, column_name, vendor):
                cursor.execute(
                    f"ALTER TABLE {table_name} ADD COLUMN {column_name} "
                    "TEXT NOT NULL DEFAULT '[]'"
                )
            else:
                cursor.execute(
                    f"UPDATE {table_name} SET {column_name} = '[]' "
                    f"WHERE {column_name} IS NULL OR {column_name} = ''"
                )
            return

        if vendor == "mysql":
            if _column_exists(cursor, table_name, column_name, vendor):
                cursor.execute(
                    f"UPDATE {table_name} SET {column_name} = JSON_ARRAY() "
                    f"WHERE {column_name} IS NULL"
                )
                return

            # JSON defaults require MySQL 8.0.13+; add nullable, backfill, then enforce NOT NULL.
            cursor.execute(
                f"ALTER TABLE {table_name} ADD COLUMN {column_name} JSON NULL"
            )
            cursor.execute(
                f"UPDATE {table_name} SET {column_name} = JSON_ARRAY() "
                f"WHERE {column_name} IS NULL"
            )
            cursor.execute(
                f"ALTER TABLE {table_name} MODIFY COLUMN {column_name} JSON NOT NULL"
            )
            return

        if vendor == "postgresql":
            if _column_exists(cursor, table_name, column_name, vendor):
                cursor.execute(
                    f"UPDATE {table_name} SET {column_name} = '[]'::jsonb "
                    f"WHERE {column_name} IS NULL"
                )
                return

            cursor.execute(
                f"ALTER TABLE {table_name} ADD COLUMN {column_name} "
                "JSONB NOT NULL DEFAULT '[]'::jsonb"
            )
            return

        raise NotImplementedError(
            f"Unsupported database vendor for sale_tax_ids migration: {vendor}"
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
