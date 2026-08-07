from django.db import models

from core.base_entity import BaseEntity


class Menu(BaseEntity):
    menu_name = models.CharField(max_length=150)
    parent_menu = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        related_name="children",
        db_column="parent_menu_id",
        null=True,
        blank=True,
    )
    icon = models.CharField(max_length=100, blank=True, default="")
    display_order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "menus"
        verbose_name = "Menu"
        verbose_name_plural = "Menus"
        ordering = ("display_order", "menu_name")

    def __str__(self):
        return self.menu_name


class RolePermission(BaseEntity):
    role = models.ForeignKey(
        "roles.Role",
        on_delete=models.CASCADE,
        related_name="role_permissions",
        db_column="role_id",
    )
    menu = models.ForeignKey(
        Menu,
        on_delete=models.CASCADE,
        related_name="menu_permissions",
        db_column="menu_id",
    )
    can_view = models.BooleanField(default=False)
    can_add = models.BooleanField(default=False)
    can_edit = models.BooleanField(default=False)
    can_delete = models.BooleanField(default=False)
    can_export = models.BooleanField(default=False)

    class Meta:
        db_table = "role_permissions"
        verbose_name = "Role Permission"
        verbose_name_plural = "Role Permissions"
        constraints = [
            models.UniqueConstraint(
                fields=["role", "menu"],
                condition=models.Q(is_deleted=False),
                name="uniq_active_role_menu_permission",
            )
        ]

    def __str__(self):
        return f"{self.role_id} -> {self.menu_id}"
