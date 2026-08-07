from django.db import models

from core.base_entity import BaseEntity


class Role(BaseEntity):
    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="roles",
        db_column="business_id",
        null=True,
        blank=True,
    )
    role_name = models.CharField(max_length=100)
    description = models.TextField(blank=True, default="")

    class Meta:
        db_table = "roles"
        verbose_name = "Role"
        verbose_name_plural = "Roles"
        constraints = [
            models.UniqueConstraint(
                fields=["business", "role_name"],
                condition=models.Q(is_deleted=False, business__isnull=False),
                name="uniq_active_business_role_name",
            ),
            models.UniqueConstraint(
                fields=["role_name"],
                condition=models.Q(is_deleted=False, business__isnull=True),
                name="uniq_active_global_role_name",
            ),
        ]

    def __str__(self):
        return self.role_name
