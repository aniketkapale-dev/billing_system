from django.db import models

from apps.users.models import User
from core.base_entity import BaseEntity


class Business(BaseEntity):
    owner = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="businesses",
        db_column="owner_id",
    )
    business_name = models.CharField(max_length=150)
    gst_number = models.CharField(max_length=30, blank=True, default="")
    phone = models.CharField(max_length=20, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    address = models.TextField(blank=True, default="")
    logo = models.ImageField(upload_to="business_logos/", blank=True, null=True)

    class Meta:
        db_table = "businesses"
        verbose_name = "Business"
        verbose_name_plural = "Businesses"
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "business_name"],
                condition=models.Q(is_deleted=False),
                name="uniq_active_owner_business_name",
            )
        ]

    def __str__(self):
        return self.business_name
