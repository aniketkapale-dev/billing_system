from apps.customers.repositories import CustomerRepository
from core.base_service import BaseService
from core.exceptions import ValidationException
from core.middleware import get_current_user
from core.validators import validate_mobile_number, validate_required


class CustomerService(BaseService):
    def __init__(self):
        super().__init__(repository=CustomerRepository())

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
            validate_required(data["name"], "Customer name")

        name = (data.get("name") or "").strip()
        if name:
            data["name"] = name
            qs = self.repository.model.objects.filter(
                business_id=business_id or data.get("business_id"),
                name__iexact=name,
                is_deleted=False,
            )
            if exclude_pk:
                qs = qs.exclude(pk=exclude_pk)
            if qs.exists():
                raise ValidationException("A customer with this name already exists.")

        if "mobile" in data:
            mobile = (data.get("mobile") or "").strip()
            validate_required(mobile, "Mobile number")
            data["mobile"] = validate_mobile_number(mobile)
