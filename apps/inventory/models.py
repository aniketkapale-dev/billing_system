from decimal import Decimal

from django.db import models

from apps.products.models import Product
from apps.users.models import User
from core.base_entity import BaseEntity


class MovementType(models.TextChoices):
    IN = "in", "In"
    OUT = "out", "Out"


class StockMovement(BaseEntity):
    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="stock_movements",
        db_column="business_id",
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="stock_movements",
        db_column="product_id",
    )
    inventory_batch = models.ForeignKey(
        "invoicing.InventoryBatch",
        on_delete=models.SET_NULL,
        related_name="stock_movements",
        db_column="inventory_batch_id",
        null=True,
        blank=True,
    )
    reference_type = models.CharField(max_length=50)
    reference_id = models.BigIntegerField()
    movement_type = models.CharField(max_length=10, choices=MovementType.choices)
    quantity = models.DecimalField(max_digits=12, decimal_places=2)
    balance_quantity = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))

    class Meta:
        db_table = "stock_movements"
        verbose_name = "Stock Movement"
        verbose_name_plural = "Stock Movements"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.movement_type} {self.quantity} — product {self.product_id}"


class InventoryStock(BaseEntity):
    owner = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="inventory_stocks",
        db_column="owner_id",
    )
    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="inventory_stocks",
        db_column="business_id",
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="inventory_stocks",
        db_column="product_id",
    )
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))

    class Meta:
        db_table = "inventory_stocks"
        verbose_name = "Inventory Stock"
        verbose_name_plural = "Inventory Stocks"
        constraints = [
            models.UniqueConstraint(
                fields=["business", "product"],
                condition=models.Q(is_deleted=False),
                name="uniq_active_business_product_stock",
            )
        ]

    def __str__(self):
        return f"{self.product_id}: {self.quantity}"
