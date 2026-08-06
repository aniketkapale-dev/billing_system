from django.db import models

from apps.roles.models import Role
from apps.users.models import User
from core.base_entity import BaseEntity


class UserRole(BaseEntity):
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="user_roles", db_column="user_id"
    )
    role = models.ForeignKey(
        Role, on_delete=models.CASCADE, related_name="role_users", db_column="role_id"
    )

    class Meta:
        db_table = "user_roles"
        verbose_name = "User Role"
        verbose_name_plural = "User Roles"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "role"],
                condition=models.Q(is_deleted=False),
                name="uniq_active_user_role",
            )
        ]

    def __str__(self):
        return f"{self.user_id} -> {self.role_id}"
