"""
Managers / querysets used by BaseEntity to enforce soft-delete semantics.
"""
from django.db import models


class SoftDeleteQuerySet(models.QuerySet):
    def soft_delete(self):
        from django.utils import timezone

        from core.middleware import get_current_ip, get_current_user

        user = get_current_user()
        now = timezone.now()
        user_id = getattr(user, "id", None)
        ip = get_current_ip()
        return self.update(
            is_deleted=True,
            is_active=False,
            deleted_at=now,
            deleted_by=user_id,
            deleted_ip=ip,
            updated_at=now,
            updated_by=user_id,
            updated_ip=ip,
        )

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
