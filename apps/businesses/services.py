from apps.businesses.repositories import BusinessRepository
from core.base_service import BaseService
from core.exceptions import ValidationException
from core.middleware import get_current_user
from core.validators import validate_required


class BusinessService(BaseService):
    def __init__(self):
        super().__init__(repository=BusinessRepository())

    def before_create(self, data):
        user = get_current_user()
        if not user:
            raise ValidationException("Authentication required.")
        data["owner_id"] = user.id
        self._validate(data)

    def before_update(self, instance, data):
        data.pop("owner_id", None)
        self._validate(data, exclude_pk=instance.pk, owner_id=instance.owner_id)

    def _validate(self, data, exclude_pk=None, owner_id=None):
        if "name" in data:
            validate_required(data["name"], "Business name")

        name = data.get("name")
        if name:
            qs = self.repository.model.objects.filter(
                owner_id=owner_id or data.get("owner_id"),
                name=name,
                is_deleted=False,
            )
            if exclude_pk:
                qs = qs.exclude(pk=exclude_pk)
            if qs.exists():
                raise ValidationException("You already have a business with this name.")
