from decimal import Decimal

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
    category = models.ForeignKey(
        "catalog.Category",
        on_delete=models.SET_NULL,
        related_name="products",
        db_column="category_id",
        null=True,
        blank=True,
    )
    brand = models.ForeignKey(
        "catalog.Brand",
        on_delete=models.SET_NULL,
        related_name="products",
        db_column="brand_id",
        null=True,
        blank=True,
    )
    manufacturer = models.ForeignKey(
        "catalog.Manufacturer",
        on_delete=models.SET_NULL,
        related_name="products",
        db_column="manufacturer_id",
        null=True,
        blank=True,
    )
    unit = models.ForeignKey(
        "catalog.Unit",
        on_delete=models.PROTECT,
        related_name="products",
        db_column="unit_id",
    )
    tax = models.ForeignKey(
        "settings.Tax",
        on_delete=models.SET_NULL,
        related_name="products",
        db_column="tax_id",
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=150)
    sku = models.CharField(max_length=50, blank=True, default="")
    barcode = models.CharField(max_length=100, blank=True, default="")
    description = models.TextField(blank=True, default="")
    actual_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    mrp = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    purchase_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    sale_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))

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
