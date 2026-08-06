from apps.users.repositories import UserRepository
from core.base_service import BaseService
from core.validators import (
    ensure_unique,
    validate_email_format,
    validate_mobile_number,
)


class UserService(BaseService):
    def __init__(self):
        super().__init__(repository=UserRepository())

    def before_create(self, data):
        self._normalize_and_validate(data)
        self._hash_password(data)

    def before_update(self, instance, data):
        self._normalize_and_validate(data, exclude_pk=instance.pk)
        self._hash_password(data)

    # -- helpers -----------------------------------------------------------
    def _normalize_and_validate(self, data, exclude_pk=None):
        if "email" in data:
            data["email"] = validate_email_format(data["email"]).lower()
            ensure_unique(self.repository, "email", data["email"], exclude_pk)
        if "mobile_number" in data:
            data["mobile_number"] = validate_mobile_number(data["mobile_number"])
            ensure_unique(self.repository, "mobile_number",
                          data["mobile_number"], exclude_pk)

    def _hash_password(self, data):
        raw = data.pop("password", None)
        if raw:
            from django.contrib.auth.hashers import make_password

            data["password"] = make_password(raw)
