from django.db import models

from core.base_entity import BaseEntity


class Role(BaseEntity):
    role_name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True, default="")

    class Meta:
        db_table = "roles"
        verbose_name = "Role"
        verbose_name_plural = "Roles"

    def __str__(self):
        return self.role_name
