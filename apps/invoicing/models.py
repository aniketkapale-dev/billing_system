from decimal import Decimal

from django.core.validators import FileExtensionValidator
from django.db import models
from django.utils import timezone

from core.base_entity import BaseEntity


def purchase_invoice_upload_path(instance, filename):
    return f"purchase_invoices/{instance.business_id}/{filename}"


class PurchaseInvoice(BaseEntity):
    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="purchase_invoices",
        db_column="business_id",
    )
    invoice_number = models.CharField(max_length=50)
    invoice_date = models.DateField(default=timezone.localdate)
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    discount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    tax = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    grand_total = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    remarks = models.TextField(blank=True, default="")
    attachment = models.FileField(
        upload_to=purchase_invoice_upload_path,
        blank=True,
        null=True,
        validators=[
            FileExtensionValidator(
                allowed_extensions=["pdf", "jpg", "jpeg", "png", "webp", "gif"]
            )
        ],
    )

    class Meta:
        db_table = "purchase_invoices"
        verbose_name = "Purchase Invoice"
        verbose_name_plural = "Purchase Invoices"
        ordering = ("-invoice_date", "-created_at")
        constraints = [
            models.UniqueConstraint(
                fields=["business", "invoice_number"],
                condition=models.Q(is_deleted=False),
                name="uniq_active_business_purchase_invoice_no",
            )
        ]

    def __str__(self):
        return self.invoice_number


class PurchaseInvoiceItem(BaseEntity):
    purchase_invoice = models.ForeignKey(
        PurchaseInvoice,
        on_delete=models.CASCADE,
        related_name="items",
        db_column="purchase_invoice_id",
    )
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.PROTECT,
        related_name="purchase_invoice_items",
        db_column="product_id",
    )
    quantity = models.DecimalField(max_digits=12, decimal_places=2)
    purchase_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    selling_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    tax = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    batch_number = models.CharField(max_length=50, blank=True, default="")
    expiry_date = models.DateField(null=True, blank=True)
    line_total = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))

    class Meta:
        db_table = "purchase_invoice_items"
        verbose_name = "Purchase Invoice Item"
        verbose_name_plural = "Purchase Invoice Items"

    def __str__(self):
        return f"{self.product_id} x {self.quantity}"


class InventoryBatch(BaseEntity):
    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="inventory_batches",
        db_column="business_id",
    )
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.PROTECT,
        related_name="inventory_batches",
        db_column="product_id",
    )
    purchase_invoice_item = models.ForeignKey(
        PurchaseInvoiceItem,
        on_delete=models.SET_NULL,
        related_name="inventory_batches",
        db_column="purchase_invoice_item_id",
        null=True,
        blank=True,
    )
    batch_number = models.CharField(max_length=50, blank=True, default="")
    purchase_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    selling_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    purchased_quantity = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    available_quantity = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    manufacture_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "inventory_batches"
        verbose_name = "Inventory Batch"
        verbose_name_plural = "Inventory Batches"

    def __str__(self):
        return f"{self.product_id} batch {self.batch_number or self.pk}"


class SalesInvoice(BaseEntity):
    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="sales_invoices",
        db_column="business_id",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.SET_NULL,
        related_name="sales_invoices",
        db_column="customer_id",
        null=True,
        blank=True,
    )
    invoice_number = models.CharField(max_length=50)
    invoice_date = models.DateField(default=timezone.localdate)
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    discount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    tax = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    grand_total = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    payment_mode = models.CharField(max_length=50, blank=True, default="")

    class Meta:
        db_table = "sales_invoices"
        verbose_name = "Sales Invoice"
        verbose_name_plural = "Sales Invoices"
        ordering = ("-invoice_date", "-created_at")
        constraints = [
            models.UniqueConstraint(
                fields=["business", "invoice_number"],
                condition=models.Q(is_deleted=False),
                name="uniq_active_business_sales_invoice_no",
            )
        ]

    def __str__(self):
        return self.invoice_number


class SalesInvoiceItem(BaseEntity):
    sales_invoice = models.ForeignKey(
        SalesInvoice,
        on_delete=models.CASCADE,
        related_name="items",
        db_column="sales_invoice_id",
    )
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.PROTECT,
        related_name="sales_invoice_items",
        db_column="product_id",
    )
    quantity = models.DecimalField(max_digits=12, decimal_places=2)
    selling_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    tax = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    line_total = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))

    class Meta:
        db_table = "sales_invoice_items"
        verbose_name = "Sales Invoice Item"
        verbose_name_plural = "Sales Invoice Items"

    def __str__(self):
        return f"{self.product_id} x {self.quantity}"


class BatchConsumption(BaseEntity):
    sales_invoice_item = models.ForeignKey(
        SalesInvoiceItem,
        on_delete=models.CASCADE,
        related_name="batch_consumptions",
        db_column="sales_invoice_item_id",
        null=True,
        blank=True,
    )
    purchase_item = models.ForeignKey(
        "purchases.PurchaseItem",
        on_delete=models.CASCADE,
        related_name="batch_consumptions",
        db_column="purchase_item_id",
        null=True,
        blank=True,
    )
    inventory_batch = models.ForeignKey(
        InventoryBatch,
        on_delete=models.PROTECT,
        related_name="batch_consumptions",
        db_column="inventory_batch_id",
    )
    quantity_sold = models.DecimalField(max_digits=12, decimal_places=2)
    purchase_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    selling_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    profit = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))

    class Meta:
        db_table = "batch_consumptions"
        verbose_name = "Batch Consumption"
        verbose_name_plural = "Batch Consumptions"

    def __str__(self):
        return f"batch {self.inventory_batch_id} qty {self.quantity_sold}"
