from decimal import Decimal

from apps.inventory.batch_service import BatchInventoryService
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
        self.batch_service = BatchInventoryService()
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
        purchase_price = data.get("purchase_price")
        sale_price = data.get("sale_price")
        self._opening_purchase_price = Decimal(str(purchase_price or 0))
        self._opening_sale_price = Decimal(str(sale_price or 0))
        self._validate_catalog_refs(data, business_id)
        self._validate(data)

    def after_create(self, instance):
        self.inventory_service.set_stock(
            self._business_id,
            instance.id,
            self._initial_quantity,
        )
        if self._initial_quantity > 0:
            self.batch_service.create_opening_batch(
                business_id=self._business_id,
                product_id=instance.id,
                quantity=self._initial_quantity,
                purchase_price=self._opening_purchase_price,
                selling_price=self._opening_sale_price,
            )

    def before_update(self, instance, data):
        data.pop("owner_id", None)
        data.pop("business_id", None)
        data.pop("quantity", None)
        self._validate_catalog_refs(data, instance.business_id, instance=instance)
        self._validate(data, exclude_pk=instance.pk, business_id=instance.business_id)

    def _validate_catalog_refs(self, data, business_id, instance=None):
        category = data.get("category")
        if category is not None and category.business_id != business_id:
            raise ValidationException("Selected category does not belong to this business.")

        brand = data.get("brand")
        if brand is not None and brand.business_id != business_id:
            raise ValidationException("Selected brand does not belong to this business.")

        unit = data.get("unit")
        if unit is not None:
            if unit.business_id != business_id:
                raise ValidationException("Selected unit does not belong to this business.")
            if not unit.is_active or unit.is_deleted:
                raise ValidationException("Selected unit is not available.")
        elif instance is None:
            raise ValidationException("Unit is required.")

        if "category" in data and data["category"] is not None:
            category_obj = data["category"]
            if category_obj.is_deleted or not category_obj.is_active:
                raise ValidationException("Selected category is not available.")

        if "brand" in data and data["brand"] is not None:
            brand_obj = data["brand"]
            if brand_obj.is_deleted or not brand_obj.is_active:
                raise ValidationException("Selected brand is not available.")

    def _validate(self, data, exclude_pk=None, business_id=None):
        if "name" in data:
            validate_required(data["name"], "Product name")

        if exclude_pk is None or "purchase_price" in data:
            if "purchase_price" not in data or data.get("purchase_price") is None:
                raise ValidationException("Buy price is required.")
            if data["purchase_price"] < 0:
                raise ValidationException("Buy price cannot be negative.")

        if exclude_pk is None or "sale_price" in data:
            if "sale_price" not in data or data.get("sale_price") is None:
                raise ValidationException("Sell price is required.")
            if data["sale_price"] < 0:
                raise ValidationException("Sell price cannot be negative.")

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
