from decimal import Decimal

from django.db import migrations, models
import django.utils.timezone


def backfill_paid_sales(apps, schema_editor):
    Purchase = apps.get_model("purchases", "Purchase")
    PurchasePayment = apps.get_model("purchases", "PurchasePayment")

    for purchase in Purchase.objects.filter(
        is_deleted=False,
        is_draft=False,
        is_cancelled=False,
        is_paid=True,
    ):
        if PurchasePayment.objects.filter(purchase_id=purchase.id, is_deleted=False).exists():
            continue
        payment_date = purchase.purchase_date
        if purchase.paid_at:
            payment_date = purchase.paid_at.date()
        PurchasePayment.objects.create(
            purchase_id=purchase.id,
            amount=purchase.total_amount or Decimal("0"),
            payment_date=payment_date,
            next_due_date=None,
            payment_type_id=purchase.payment_type_id,
            notes="",
        )


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0004_paymenttype"),
        ("purchases", "0017_purchase_due_date"),
    ]

    operations = [
        migrations.CreateModel(
            name="PurchasePayment",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("deleted_at", models.DateTimeField(blank=True, null=True)),
                ("created_by", models.BigIntegerField(blank=True, null=True)),
                ("updated_by", models.BigIntegerField(blank=True, null=True)),
                ("deleted_by", models.BigIntegerField(blank=True, null=True)),
                ("created_ip", models.GenericIPAddressField(blank=True, null=True)),
                ("updated_ip", models.GenericIPAddressField(blank=True, null=True)),
                ("deleted_ip", models.GenericIPAddressField(blank=True, null=True)),
                ("is_active", models.BooleanField(default=True)),
                ("is_deleted", models.BooleanField(default=False)),
                ("amount", models.DecimalField(decimal_places=2, max_digits=14)),
                ("payment_date", models.DateField(default=django.utils.timezone.localdate)),
                ("next_due_date", models.DateField(blank=True, null=True)),
                ("notes", models.TextField(blank=True, default="")),
                (
                    "payment_type",
                    models.ForeignKey(
                        blank=True,
                        db_column="payment_type_id",
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="purchase_payments",
                        to="catalog.paymenttype",
                    ),
                ),
                (
                    "purchase",
                    models.ForeignKey(
                        db_column="purchase_id",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="payments",
                        to="purchases.purchase",
                    ),
                ),
            ],
            options={
                "verbose_name": "Purchase Payment",
                "verbose_name_plural": "Purchase Payments",
                "db_table": "purchase_payments",
                "ordering": ("payment_date", "created_at"),
            },
        ),
        migrations.RunPython(backfill_paid_sales, migrations.RunPython.noop),
    ]
