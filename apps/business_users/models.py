from django.db import models

from core.base_entity import BaseEntity


class BusinessUser(BaseEntity):
    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="business_users",
        db_column="business_id",
    )
    user = models.ForeignKey(
        "users.User",
        on_delete=models.CASCADE,
        related_name="business_memberships",
        db_column="user_id",
    )
    role = models.ForeignKey(
        "roles.Role",
        on_delete=models.PROTECT,
        related_name="business_user_roles",
        db_column="role_id",
    )

    class Meta:
        db_table = "business_users"
        verbose_name = "Business User"
        verbose_name_plural = "Business Users"
        constraints = [
            models.UniqueConstraint(
                fields=["business", "user"],
                condition=models.Q(is_deleted=False),
                name="uniq_active_business_user",
            )
        ]

    def __str__(self):
        return f"{self.user_id} @ {self.business_id}"
