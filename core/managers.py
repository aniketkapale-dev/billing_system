"""
Managers / querysets used by BaseEntity to enforce soft-delete semantics.
"""
from django.db import models


class SoftDeleteQuerySet(models.QuerySet):
    def active(self):
        return self.filter(is_active=True, is_deleted=False)

    def inactive(self):
        return self.filter(is_active=False, is_deleted=False)

    def deleted(self):
        return self.filter(is_deleted=True)


class ActiveManager(models.Manager):
    """Default manager: only rows that have NOT been soft-deleted."""

    def get_queryset(self):
        return SoftDeleteQuerySet(self.model, using=self._db).filter(is_deleted=False)

    def active(self):
        return self.get_queryset().active()

    def inactive(self):
        return self.get_queryset().inactive()


class AllObjectsManager(models.Manager):
    """Escape hatch: includes soft-deleted rows (e.g. for restore)."""

    def get_queryset(self):
        return SoftDeleteQuerySet(self.model, using=self._db)

    def deleted(self):
        return self.get_queryset().deleted()
