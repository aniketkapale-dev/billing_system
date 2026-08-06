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
    name = models.CharField(max_length=150)

    class Meta:
        db_table = "businesses"
        verbose_name = "Business"
        verbose_name_plural = "Businesses"
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "name"],
                condition=models.Q(is_deleted=False),
                name="uniq_active_owner_business_name",
            )
        ]

    def __str__(self):
        return self.name
