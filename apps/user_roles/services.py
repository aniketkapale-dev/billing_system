from apps.user_roles.repositories import UserRoleRepository
from core.base_service import BaseService
from core.exceptions import ValidationException
from core.validators import validate_required


class UserRoleService(BaseService):
    def __init__(self):
        super().__init__(repository=UserRoleRepository())

    def before_create(self, data):
        self._validate(data)

    def before_update(self, instance, data):
        self._validate(data, exclude_pk=instance.pk)

    def _validate(self, data, exclude_pk=None):
        user = data.get("user")
        role = data.get("role")
        validate_required(user, "User")
        validate_required(role, "Role")
        qs = self.repository.model.objects.filter(user=user, role=role)
        if exclude_pk is not None:
            qs = qs.exclude(pk=exclude_pk)
        if qs.exists():
            raise ValidationException("This user already has the selected role.")
