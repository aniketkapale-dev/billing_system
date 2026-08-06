from decimal import Decimal

from django.db import transaction

from apps.inventory.services import InventoryStockService
from apps.products.models import Product
from apps.purchases.models import PurchaseItem
from apps.purchases.repositories import PurchaseRepository
from core.base_service import BaseService
from core.exceptions import NotFoundException, ValidationException
from core.middleware import get_current_user
from core.validators import validate_required


class PurchaseService(BaseService):
    def __init__(self):
        super().__init__(repository=PurchaseRepository())
        self.inventory_service = InventoryStockService()

    @transaction.atomic
    def create_with_items(self, data):
        user = get_current_user()
        if not user:
            raise ValidationException("Authentication required.")

        business_id = data.get("business_id")
        if not business_id:
            raise ValidationException("Business is required.")

        items_data = data.pop("items", [])
        if not items_data:
            raise ValidationException("At least one purchase item is required.")

        validate_required(data.get("customer_name"), "Customer name")

        total_amount = Decimal("0")
        prepared_items = []
        requested_by_product = {}

        for item in items_data:
            product_id = item.get("product_id")
            quantity = Decimal(str(item.get("quantity", 0)))
            unit_price = Decimal(str(item.get("unit_price", 0)))

            if quantity <= 0:
                raise ValidationException("Item quantity must be greater than zero.")
            if unit_price < 0:
                raise ValidationException("Item unit price cannot be negative.")

            try:
                product = Product.objects.get(
                    pk=product_id,
                    business_id=business_id,
                    is_deleted=False,
                )
            except Product.DoesNotExist:
                raise NotFoundException(f"Product with id {product_id} not found.")

            requested_by_product[product_id] = (
                requested_by_product.get(product_id, Decimal("0")) + quantity
            )

            line_total = quantity * unit_price
            total_amount += line_total
            prepared_items.append({
                "product": product,
                "quantity": quantity,
                "unit_price": unit_price,
                "line_total": line_total,
            })

        for product_id, requested_qty in requested_by_product.items():
            available = self.inventory_service.get_available_quantity(business_id, product_id)
            if requested_qty > available:
                product = Product.objects.get(pk=product_id)
                raise ValidationException(
                    f"Insufficient stock for {product.name}. "
                    f"Available: {available}, requested: {requested_qty}."
                )

        data["owner_id"] = user.id
        data["total_amount"] = total_amount
        purchase = self.repository.create(**data)

        for item in prepared_items:
            PurchaseItem.objects.create(
                purchase=purchase,
                product=item["product"],
                quantity=item["quantity"],
                unit_price=item["unit_price"],
                line_total=item["line_total"],
            )
            self.inventory_service.deduct_stock(
                business_id,
                item["product"].id,
                item["quantity"],
            )

        return purchase
