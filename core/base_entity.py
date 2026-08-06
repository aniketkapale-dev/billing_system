"""
BaseEntity: the single abstract model every entity inherits from.

Provides identity, audit trail (who/when/where), activation and soft-delete.
These fields are defined exactly once and never repeated in concrete models.
"""
from django.db import models

from core.managers import ActiveManager, AllObjectsManager
from core.middleware import get_current_ip, get_current_user


class BaseEntity(models.Model):
    id = models.BigAutoField(primary_key=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    # Audit "who" fields reference the custom User by id (no FK to avoid
    # circular import / hard dependency; stored as nullable big integers).
    created_by = models.BigIntegerField(null=True, blank=True)
    updated_by = models.BigIntegerField(null=True, blank=True)
    deleted_by = models.BigIntegerField(null=True, blank=True)

    created_ip = models.GenericIPAddressField(null=True, blank=True)
    updated_ip = models.GenericIPAddressField(null=True, blank=True)
    deleted_ip = models.GenericIPAddressField(null=True, blank=True)

    is_active = models.BooleanField(default=True)
    is_deleted = models.BooleanField(default=False)

    # Default manager hides soft-deleted rows; `all_objects` sees everything.
    objects = ActiveManager()
    all_objects = AllObjectsManager()

    class Meta:
        abstract = True
        ordering = ("-created_at",)

    # -- audit-aware persistence ------------------------------------------
    def save(self, *args, **kwargs):
        user = get_current_user()
        ip = get_current_ip()
        user_id = getattr(user, "id", None)

        if self._state.adding:
            if self.created_by is None:
                self.created_by = user_id
            if self.created_ip is None:
                self.created_ip = ip
        else:
            self.updated_by = user_id
            self.updated_ip = ip
        super().save(*args, **kwargs)

    def soft_delete(self):
        from django.utils import timezone

        user = get_current_user()
        self.is_deleted = True
        self.is_active = False
        self.deleted_at = timezone.now()
        self.deleted_by = getattr(user, "id", None)
        self.deleted_ip = get_current_ip()
        self.save(update_fields=[
            "is_deleted", "is_active", "deleted_at",
            "deleted_by", "deleted_ip", "updated_at",
        ])

    def restore(self):
        self.is_deleted = False
        self.is_active = True
        self.deleted_at = None
        self.deleted_by = None
        self.deleted_ip = None
        self.save(update_fields=[
            "is_deleted", "is_active", "deleted_at",
            "deleted_by", "deleted_ip", "updated_at",
        ])
