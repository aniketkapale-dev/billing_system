from django.core.validators import validate_email
from django.db import transaction

from apps.businesses.repositories import BusinessRepository
from apps.products.models import Product
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
        data.pop("clear_logo", None)
        data["owner_id"] = user.id
        self._validate(data)

    def before_update(self, instance, data):
        data.pop("owner_id", None)
        if data.pop("clear_logo", False):
            if instance.logo:
                instance.logo.delete(save=False)
            data["logo"] = None
        self._validate(data, exclude_pk=instance.pk, owner_id=instance.owner_id)

    def _validate(self, data, exclude_pk=None, owner_id=None):
        if "business_name" in data:
            validate_required(data["business_name"], "Business name")

        business_name = data.get("business_name")
        if business_name:
            qs = self.repository.model.objects.filter(
                owner_id=owner_id or data.get("owner_id"),
                business_name=business_name,
                is_deleted=False,
            )
            if exclude_pk:
                qs = qs.exclude(pk=exclude_pk)
            if qs.exists():
                raise ValidationException("You already have a business with this name.")

        email = data.get("email")
        if email:
            try:
                validate_email(email)
            except Exception as exc:
                raise ValidationException("Enter a valid email address.") from exc

    @staticmethod
    def has_products(business_id):
        return Product.objects.filter(
            business_id=business_id,
            is_deleted=False,
        ).exists()

    @transaction.atomic
    def soft_delete(self, pk):
        instance = self.repository.get_by_id(pk)
        if self.has_products(instance.id):
            raise ValidationException(
                "This business has products and cannot be deleted. "
                "Remove all products first."
            )
        return self.repository.soft_delete(instance)
