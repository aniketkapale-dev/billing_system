from decimal import Decimal

from django.db import models

from apps.products.models import Product
from apps.users.models import User
from core.base_entity import BaseEntity


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
