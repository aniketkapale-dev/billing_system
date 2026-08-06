from apps.roles.repositories import RoleRepository
from core.base_service import BaseService
from core.validators import ensure_unique, validate_required


class RoleService(BaseService):
    def __init__(self):
        super().__init__(repository=RoleRepository())

    def before_create(self, data):
        self._validate(data)

    def before_update(self, instance, data):
        self._validate(data, exclude_pk=instance.pk)

    def _validate(self, data, exclude_pk=None):
        if "role_name" in data:
            validate_required(data["role_name"], "Role name")
            ensure_unique(self.repository, "role_name", data["role_name"], exclude_pk)
