from apps.catalog.repositories import BrandRepository, CategoryRepository, UnitRepository
from core.base_service import BaseService
from core.exceptions import ValidationException
from core.middleware import get_current_user
from core.validators import validate_required


class UnitService(BaseService):
    def __init__(self):
        super().__init__(repository=UnitRepository())

    def before_create(self, data):
        user = get_current_user()
        if not user:
            raise ValidationException("Authentication required.")
        data.pop("owner_id", None)
        business_id = data.get("business_id")
        if not business_id:
            raise ValidationException("Business is required.")
        self._validate(data)

    def before_update(self, instance, data):
        data.pop("owner_id", None)
        data.pop("business_id", None)
        self._validate(data, exclude_pk=instance.pk, business_id=instance.business_id)

    def _validate(self, data, exclude_pk=None, business_id=None):
        if "name" in data:
            validate_required(data["name"], "Unit name")
        if "short_name" in data:
            validate_required(data["short_name"], "Unit short name")

        scoped_business_id = business_id or data.get("business_id")
        name = data.get("name")
        if name:
            qs = self.repository.model.objects.filter(
                business_id=scoped_business_id,
                name=name,
                is_deleted=False,
            )
            if exclude_pk:
                qs = qs.exclude(pk=exclude_pk)
            if qs.exists():
                raise ValidationException("A unit with this name already exists.")

        short_name = data.get("short_name")
        if short_name:
            qs = self.repository.model.objects.filter(
                business_id=scoped_business_id,
                short_name=short_name,
                is_deleted=False,
            )
            if exclude_pk:
                qs = qs.exclude(pk=exclude_pk)
            if qs.exists():
                raise ValidationException("A unit with this short name already exists.")


class CategoryService(BaseService):
    def __init__(self):
        super().__init__(repository=CategoryRepository())

    def before_create(self, data):
        user = get_current_user()
        if not user:
            raise ValidationException("Authentication required.")
        data.pop("owner_id", None)
        business_id = data.get("business_id")
        if not business_id:
            raise ValidationException("Business is required.")
        self._validate(data)

    def before_update(self, instance, data):
        data.pop("owner_id", None)
        data.pop("business_id", None)
        self._validate(data, exclude_pk=instance.pk, business_id=instance.business_id)

    def _validate(self, data, exclude_pk=None, business_id=None):
        if "name" in data:
            validate_required(data["name"], "Category name")

        name = data.get("name")
        if name:
            qs = self.repository.model.objects.filter(
                business_id=business_id or data.get("business_id"),
                name=name,
                is_deleted=False,
            )
            if exclude_pk:
                qs = qs.exclude(pk=exclude_pk)
            if qs.exists():
                raise ValidationException("A category with this name already exists.")


class BrandService(BaseService):
    def __init__(self):
        super().__init__(repository=BrandRepository())

    def before_create(self, data):
        user = get_current_user()
        if not user:
            raise ValidationException("Authentication required.")
        data.pop("owner_id", None)
        business_id = data.get("business_id")
        if not business_id:
            raise ValidationException("Business is required.")
        self._validate(data)

    def before_update(self, instance, data):
        data.pop("owner_id", None)
        data.pop("business_id", None)
        self._validate(data, exclude_pk=instance.pk, business_id=instance.business_id)

    def _validate(self, data, exclude_pk=None, business_id=None):
        if "name" in data:
            validate_required(data["name"], "Brand name")

        name = data.get("name")
        if name:
            qs = self.repository.model.objects.filter(
                business_id=business_id or data.get("business_id"),
                name=name,
                is_deleted=False,
            )
            if exclude_pk:
                qs = qs.exclude(pk=exclude_pk)
            if qs.exists():
                raise ValidationException("A brand with this name already exists.")
