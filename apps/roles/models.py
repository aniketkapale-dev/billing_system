from django.db import models

from apps.business_users.constants import ALL_BUSINESS_TAB_CODES
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
    allowed_tabs = models.JSONField(default=list, blank=True)

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

    def normalized_allowed_tabs(self):
        tabs = self.allowed_tabs or []
        valid = set(ALL_BUSINESS_TAB_CODES)
        return [code for code in tabs if code in valid]
