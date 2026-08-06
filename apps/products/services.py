from decimal import Decimal

from apps.inventory.services import InventoryStockService
from apps.products.repositories import ProductRepository
from core.base_service import BaseService
from core.exceptions import ValidationException
from core.middleware import get_current_user
from core.validators import validate_required


class ProductService(BaseService):
    def __init__(self):
        super().__init__(repository=ProductRepository())
        self.inventory_service = InventoryStockService()
        self._initial_quantity = Decimal("0")
        self._business_id = None

    def before_create(self, data):
        user = get_current_user()
        if not user:
            raise ValidationException("Authentication required.")

        business_id = data.get("business_id")
        if not business_id:
            raise ValidationException("Business is required.")

        data["owner_id"] = user.id
        self._business_id = business_id
        self._initial_quantity = Decimal(str(data.pop("quantity", 0) or 0))
        if self._initial_quantity < 0:
            raise ValidationException("Quantity cannot be negative.")
        self._validate(data)

    def after_create(self, instance):
        self.inventory_service.set_stock(
            self._business_id,
            instance.id,
            self._initial_quantity,
        )

    def before_update(self, instance, data):
        data.pop("owner_id", None)
        data.pop("business_id", None)
        self._validate(data, exclude_pk=instance.pk, business_id=instance.business_id)

    def _validate(self, data, exclude_pk=None, business_id=None):
        if "name" in data:
            validate_required(data["name"], "Product name")

        sku = data.get("sku")
        if sku:
            qs = self.repository.model.objects.filter(
                business_id=business_id or data.get("business_id"),
                sku=sku,
                is_deleted=False,
            )
            if exclude_pk:
                qs = qs.exclude(pk=exclude_pk)
            if qs.exists():
                raise ValidationException("A product with this SKU already exists.")
