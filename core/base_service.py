"""
BaseService: all business logic lives in services.
Services orchestrate repositories and enforce rules; they never touch the ORM
directly and never build HTTP responses.
"""
from django.db import transaction


class BaseService:
    """Generic business layer. Subclass and set `repository`."""

    repository = None

    def __init__(self, repository=None):
        if repository is not None:
            self.repository = repository
        assert self.repository is not None, "Service requires a `repository`."

    # -- read --------------------------------------------------------------
    def list(self, filters=None, order_by=None):
        return self.repository.list(filters=filters, order_by=order_by)

    def get(self, pk, include_deleted=False):
        return self.repository.get_by_id(pk, include_deleted=include_deleted)

    # -- write -------------------------------------------------------------
    @transaction.atomic
    def create(self, data):
        self.before_create(data)
        instance = self.repository.create(**data)
        self.after_create(instance)
        return instance

    @transaction.atomic
    def update(self, pk, data):
        instance = self.repository.get_by_id(pk)
        self.before_update(instance, data)
        instance = self.repository.update(instance, **data)
        self.after_update(instance)
        return instance

    @transaction.atomic
    def soft_delete(self, pk):
        instance = self.repository.get_by_id(pk)
        return self.repository.soft_delete(instance)

    @transaction.atomic
    def restore(self, pk):
        instance = self.repository.get_by_id(pk, include_deleted=True)
        return self.repository.restore(instance)

    # -- hooks (override in subclasses for validation / side effects) ------
    def before_create(self, data):
        pass

    def after_create(self, instance):
        pass

    def before_update(self, instance, data):
        pass

    def after_update(self, instance):
        pass
