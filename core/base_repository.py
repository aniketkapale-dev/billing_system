"""
BaseRepository: ALL ORM access for an entity lives in a repository.
Services call repositories; repositories never contain business rules.
"""
from core.exceptions import NotFoundException


class BaseRepository:
    """Generic data-access layer. Subclass and set `model`."""

    model = None

    def __init__(self, model=None):
        if model is not None:
            self.model = model
        assert self.model is not None, "Repository requires a `model`."

    # -- read --------------------------------------------------------------
    def get_queryset(self):
        """Non-deleted rows by default (BaseEntity default manager)."""
        return self.model.objects.all()

    def all_with_deleted(self):
        return self.model.all_objects.all()

    def list(self, filters=None, order_by=None):
        qs = self.get_queryset()
        if filters:
            qs = qs.filter(**filters)
        if order_by:
            qs = qs.order_by(*order_by)
        return qs

    def get_by_id(self, pk, include_deleted=False):
        manager = self.model.all_objects if include_deleted else self.model.objects
        try:
            return manager.get(pk=pk)
        except self.model.DoesNotExist as exc:
            raise NotFoundException(
                f"{self.model.__name__} with id {pk} not found"
            ) from exc

    def find_one(self, **filters):
        return self.get_queryset().filter(**filters).first()

    def exists(self, **filters):
        return self.model.objects.filter(**filters).exists()

    # -- write -------------------------------------------------------------
    def create(self, **data):
        instance = self.model(**data)
        instance.save()
        return instance

    def update(self, instance, **data):
        for field, value in data.items():
            setattr(instance, field, value)
        instance.save()
        return instance

    def soft_delete(self, instance):
        instance.soft_delete()
        return instance

    def restore(self, instance):
        instance.restore()
        return instance

    def hard_delete(self, instance):
        instance.delete()
        
    def get(self, **kwargs):
        return self.model.objects.get(**kwargs)
