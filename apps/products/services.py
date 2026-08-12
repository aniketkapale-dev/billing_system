from decimal import Decimal

from apps.inventory.batch_service import BatchInventoryService
from apps.inventory.services import InventoryStockService
from apps.products.repositories import ProductRepository
from apps.purchases.models import PurchaseItem
from core.base_service import BaseService
from core.exceptions import ValidationException
from core.middleware import get_current_user
from core.validators import validate_required
from django.db import transaction
from django.db.models import Sum


class ProductService(BaseService):
    SKU_PREFIX = "SKU-"

    def __init__(self):
        super().__init__(repository=ProductRepository())
        self.inventory_service = InventoryStockService()
        self.batch_service = BatchInventoryService()
        self._initial_quantity = Decimal("0")
        self._business_id = None
        self._update_quantity = None

    def _compute_purchase_price(self, actual_price, tax):
        actual = Decimal(str(actual_price or 0))
        if tax is not None and tax.value:
            rate = Decimal(str(tax.value))
            return (actual * (Decimal("1") + rate / Decimal("100"))).quantize(Decimal("0.01"))
        return actual.quantize(Decimal("0.01"))

    def _resolve_prices(self, data, tax=None, instance=None):
        if "actual_price" in data:
            actual_price = Decimal(str(data.get("actual_price") or 0))
        elif instance is not None:
            actual_price = Decimal(str(instance.actual_price or 0))
        else:
            actual_price = Decimal(str(data.get("purchase_price") or 0))
        if actual_price < 0:
            raise ValidationException("Actual price cannot be negative.")
        if tax is None:
            tax = data.get("tax")
        purchase_price = self._compute_purchase_price(actual_price, tax)
        data["actual_price"] = actual_price
        data["purchase_price"] = purchase_price
        return actual_price, purchase_price

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
        data.pop("purchase_price", None)
        actual_price, purchase_price = self._resolve_prices(data)
        if self._initial_quantity > 0:
            if actual_price <= 0:
                raise ValidationException("Actual price is required when opening stock is added.")
            self._opening_purchase_price = purchase_price
            if self._opening_purchase_price < 0:
                raise ValidationException("Buy price cannot be negative.")
        else:
            self._opening_purchase_price = Decimal("0")
        sale_price = data.pop("sale_price", None)
        data["sale_price"] = Decimal(str(sale_price or 0))
        self._opening_sale_price = data["sale_price"]
        data["sku"] = self._resolve_sku(data, business_id)
        self._validate_catalog_refs(data, business_id)
        self._validate(data, business_id=business_id)

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

    def _get_sold_quantity(self, product_id):
        total = PurchaseItem.objects.filter(
            product_id=product_id,
            is_deleted=False,
            purchase__is_deleted=False,
        ).aggregate(total=Sum("quantity"))["total"]
        return Decimal(total or 0)

    def _ensure_can_modify(self, instance):
        if self._get_sold_quantity(instance.id) > 0:
            raise ValidationException(
                "This product has sale records and cannot be edited or deleted."
            )

    @transaction.atomic
    def soft_delete(self, pk):
        instance = self.repository.get_by_id(pk)
        self._ensure_can_modify(instance)
        return self.repository.soft_delete(instance)

    def before_update(self, instance, data):
        self._ensure_can_modify(instance)
        data.pop("owner_id", None)
        data.pop("business_id", None)
        qty = data.pop("quantity", None)
        if qty is not None:
            self._update_quantity = Decimal(str(qty))
            if self._update_quantity < 0:
                raise ValidationException("Quantity cannot be negative.")
        else:
            self._update_quantity = None
        if self._update_quantity is not None and self._update_quantity > 0:
            actual_price = data.get("actual_price", instance.actual_price)
            if actual_price is not None and Decimal(str(actual_price)) <= 0:
                raise ValidationException("Actual price is required when stock quantity is set.")
        if "actual_price" in data or "tax" in data:
            tax = data["tax"] if "tax" in data else instance.tax
            data.pop("purchase_price", None)
            self._resolve_prices(data, tax=tax, instance=instance)
        if "sku" in data:
            data["sku"] = self._resolve_sku(data, instance.business_id, exclude_pk=instance.pk)
        self._validate_catalog_refs(data, instance.business_id, instance=instance)
        self._validate(data, exclude_pk=instance.pk, business_id=instance.business_id)

    def after_update(self, instance):
        if self._update_quantity is None:
            return

        business_id = instance.business_id
        current = self.inventory_service.get_available_quantity(business_id, instance.id)
        new_qty = self._update_quantity
        if new_qty == current:
            return

        delta = new_qty - current
        if delta > 0:
            self.batch_service.create_opening_batch(
                business_id=business_id,
                product_id=instance.id,
                quantity=delta,
                purchase_price=Decimal(str(instance.purchase_price or 0)),
                selling_price=Decimal(str(instance.sale_price or 0)),
                batch_number="ADJ",
            )
            self.inventory_service.add_stock(business_id, instance.id, delta)
            return

        reduce_by = abs(delta)
        try:
            self.batch_service.consume_fifo(
                business_id=business_id,
                product_id=instance.id,
                quantity=reduce_by,
                reference_type="manual_adjustment",
                reference_id=instance.id,
            )
            self.inventory_service.deduct_stock(business_id, instance.id, reduce_by)
        except ValidationException:
            raise
        except Exception as exc:
            raise ValidationException(
                f"Cannot reduce quantity below available stock. Current stock: {current}."
            ) from exc

    def get_next_sku(self, business_id):
        return self._generate_unique_sku(business_id)

    def _normalize_sku(self, sku):
        return (sku or "").strip()

    def _sku_exists(self, business_id, sku, exclude_pk=None):
        qs = self.repository.model.objects.filter(
            business_id=business_id,
            sku=sku,
            is_deleted=False,
        )
        if exclude_pk:
            qs = qs.exclude(pk=exclude_pk)
        return qs.exists()

    def _generate_unique_sku(self, business_id, exclude_pk=None):
        prefix = self.SKU_PREFIX
        qs = self.repository.model.objects.filter(
            business_id=business_id,
            is_deleted=False,
            sku__startswith=prefix,
        )
        if exclude_pk:
            qs = qs.exclude(pk=exclude_pk)

        max_num = 0
        for sku in qs.values_list("sku", flat=True):
            suffix = sku[len(prefix) :] if sku.startswith(prefix) else ""
            if suffix.isdigit():
                max_num = max(max_num, int(suffix))

        for attempt in range(max_num + 1, max_num + 10000):
            candidate = f"{prefix}{attempt:06d}"
            if not self._sku_exists(business_id, candidate, exclude_pk=exclude_pk):
                return candidate

        raise ValidationException("Unable to generate a unique SKU.")

    def _ensure_unique_sku(self, sku, business_id, exclude_pk=None):
        if not sku:
            raise ValidationException("SKU is required.")
        if len(sku) > 50:
            raise ValidationException("SKU must be 50 characters or fewer.")
        if self._sku_exists(business_id, sku, exclude_pk=exclude_pk):
            raise ValidationException("A product with this SKU already exists.")

    def _resolve_sku(self, data, business_id, exclude_pk=None):
        sku = self._normalize_sku(data.get("sku"))
        if not sku:
            sku = self._generate_unique_sku(business_id, exclude_pk=exclude_pk)
        self._ensure_unique_sku(sku, business_id, exclude_pk=exclude_pk)
        return sku

    def _validate_catalog_refs(self, data, business_id, instance=None):
        category = data.get("category")
        if instance is None and not category:
            raise ValidationException("Category is required.")
        if category is not None and category.business_id != business_id:
            raise ValidationException("Selected category does not belong to this business.")

        brand = data.get("brand")
        if brand is not None and brand.business_id != business_id:
            raise ValidationException("Selected brand does not belong to this business.")

        manufacturer = data.get("manufacturer")
        if manufacturer is not None and manufacturer.business_id != business_id:
            raise ValidationException("Selected manufacturer does not belong to this business.")

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

        if "manufacturer" in data and data["manufacturer"] is not None:
            manufacturer_obj = data["manufacturer"]
            if manufacturer_obj.is_deleted or not manufacturer_obj.is_active:
                raise ValidationException("Selected manufacturer is not available.")

        tax = data.get("tax")
        if tax is not None and tax.business_id != business_id:
            raise ValidationException("Selected GST does not belong to this business.")
        if "tax" in data and data["tax"] is not None:
            tax_obj = data["tax"]
            if tax_obj.is_deleted or not tax_obj.is_active:
                raise ValidationException("Selected GST is not available.")

    def _validate(self, data, exclude_pk=None, business_id=None):
        if "name" in data:
            validate_required(data["name"], "Product name")

        if "actual_price" in data and data.get("actual_price") is not None:
            if data["actual_price"] < 0:
                raise ValidationException("Actual price cannot be negative.")

        if "purchase_price" in data and data.get("purchase_price") is not None:
            if data["purchase_price"] < 0:
                raise ValidationException("Buy price cannot be negative.")

        if "sale_price" in data and data.get("sale_price") is not None:
            if data["sale_price"] < 0:
                raise ValidationException("Sell price cannot be negative.")

        sku = data.get("sku")
        if sku is not None:
            sku = self._normalize_sku(sku)
            data["sku"] = sku
            self._ensure_unique_sku(
                sku,
                business_id or data.get("business_id"),
                exclude_pk=exclude_pk,
            )
