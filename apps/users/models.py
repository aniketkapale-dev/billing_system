"""
Custom User model.

We deliberately do NOT use django.contrib.auth (no auth.User, AbstractUser,
AbstractBaseUser, or PermissionsMixin). Password hashing reuses Django's secure
hashers; authentication is handled by our own JWT layer (apps/accounts).
"""
from django.contrib.auth.hashers import check_password, make_password
from django.db import models

from core.base_entity import BaseEntity


class User(BaseEntity):
    full_name = models.CharField(max_length=150)
    email = models.EmailField(unique=True)
    mobile_number = models.CharField(max_length=20, unique=True)
    password = models.CharField(max_length=255)
    profile_image = models.ImageField(
        upload_to="users/", null=True, blank=True
    )

    class Meta:
        db_table = "users"
        verbose_name = "User"
        verbose_name_plural = "Users"

    def __str__(self):
        return f"{self.full_name} <{self.email}>"

    # -- password helpers --------------------------------------------------
    def set_password(self, raw_password):
        self.password = make_password(raw_password)

    def check_password(self, raw_password):
        return check_password(raw_password, self.password)

    # -- DRF compatibility -------------------------------------------------
    @property
    def is_authenticated(self):
        """Always True for a real, resolved User instance (DRF expects this)."""
        return True

    @property
    def is_anonymous(self):
        return False

    @property
    def role_names(self):
        return list(
            self.user_roles.filter(is_deleted=False).values_list(
                "role__role_name", flat=True
            )
        )
