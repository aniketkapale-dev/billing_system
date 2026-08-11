from django.db import models

from core.base_entity import BaseEntity


class Unit(BaseEntity):
    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="units",
        db_column="business_id",
    )
    name = models.CharField(max_length=100)
    short_name = models.CharField(max_length=20)

    class Meta:
        db_table = "units"
        verbose_name = "Unit"
        verbose_name_plural = "Units"
        constraints = [
            models.UniqueConstraint(
                fields=["business", "name"],
                condition=models.Q(is_deleted=False),
                name="uniq_active_business_unit_name",
            ),
            models.UniqueConstraint(
                fields=["business", "short_name"],
                condition=models.Q(is_deleted=False),
                name="uniq_active_business_unit_short_name",
            ),
        ]

    def __str__(self):
        return self.name


class Category(BaseEntity):
    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="categories",
        db_column="business_id",
    )
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True, default="")

    class Meta:
        db_table = "categories"
        verbose_name = "Category"
        verbose_name_plural = "Categories"
        constraints = [
            models.UniqueConstraint(
                fields=["business", "name"],
                condition=models.Q(is_deleted=False),
                name="uniq_active_business_category_name",
            )
        ]

    def __str__(self):
        return self.name


class Brand(BaseEntity):
    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="brands",
        db_column="business_id",
    )
    name = models.CharField(max_length=150)

    class Meta:
        db_table = "brands"
        verbose_name = "Brand"
        verbose_name_plural = "Brands"
        constraints = [
            models.UniqueConstraint(
                fields=["business", "name"],
                condition=models.Q(is_deleted=False),
                name="uniq_active_business_brand_name",
            )
        ]

    def __str__(self):
        return self.name


class Manufacturer(BaseEntity):
    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="manufacturers",
        db_column="business_id",
    )
    name = models.CharField(max_length=150)

    class Meta:
        db_table = "manufacturers"
        verbose_name = "Manufacturer"
        verbose_name_plural = "Manufacturers"
        constraints = [
            models.UniqueConstraint(
                fields=["business", "name"],
                condition=models.Q(is_deleted=False),
                name="uniq_active_business_manufacturer_name",
            )
        ]

    def __str__(self):
        return self.name
