from decimal import Decimal

from django.db import models
from django.utils import timezone

from apps.products.models import Product
from apps.users.models import User
from core.base_entity import BaseEntity


class Purchase(BaseEntity):
    owner = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="purchases",
        db_column="owner_id",
    )
    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="purchases",
        db_column="business_id",
    )
    supplier_name = models.CharField(max_length=150, blank=True, default="")
    customer_name = models.CharField(max_length=150)
    reference_no = models.CharField(max_length=50, blank=True, default="")
    purchase_date = models.DateField(default=timezone.localdate)
    notes = models.TextField(blank=True, default="")
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    total_cost = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    total_profit = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))

    class Meta:
        db_table = "purchases"
        verbose_name = "Purchase"
        verbose_name_plural = "Purchases"
        ordering = ("-purchase_date", "-created_at")

    def __str__(self):
        return self.reference_no or f"Purchase #{self.pk}"


class PurchaseItem(BaseEntity):
    purchase = models.ForeignKey(
        Purchase,
        on_delete=models.CASCADE,
        related_name="items",
        db_column="purchase_id",
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="purchase_items",
        db_column="product_id",
    )
    quantity = models.DecimalField(max_digits=12, decimal_places=2)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    line_total = models.DecimalField(max_digits=14, decimal_places=2)
    cost_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    profit_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))

    class Meta:
        db_table = "purchase_items"
        verbose_name = "Purchase Item"
        verbose_name_plural = "Purchase Items"

    def __str__(self):
        return f"{self.product_id} x {self.quantity}"
