from django.db import models

from apps.users.models import User
from core.base_entity import BaseEntity


class Product(BaseEntity):
    owner = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="products",
        db_column="owner_id",
    )
    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="products",
        db_column="business_id",
    )
    name = models.CharField(max_length=150)
    sku = models.CharField(max_length=50, blank=True, default="")
    unit = models.CharField(max_length=20, default="pcs")
    description = models.TextField(blank=True, default="")
    purchase_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    sale_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        db_table = "products"
        verbose_name = "Product"
        verbose_name_plural = "Products"
        constraints = [
            models.UniqueConstraint(
                fields=["business", "sku"],
                condition=models.Q(is_deleted=False) & ~models.Q(sku=""),
                name="uniq_active_business_product_sku",
            )
        ]

    def __str__(self):
        return self.name
