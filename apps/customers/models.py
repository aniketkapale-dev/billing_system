from django.db import models

from core.base_entity import BaseEntity


class Customer(BaseEntity):
    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="customers",
        db_column="business_id",
    )
    name = models.CharField(max_length=150)
    mobile = models.CharField(max_length=20, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    gst_number = models.CharField(max_length=30, blank=True, default="")
    address = models.TextField(blank=True, default="")

    class Meta:
        db_table = "customers"
        verbose_name = "Customer"
        verbose_name_plural = "Customers"

    def __str__(self):
        return self.name
