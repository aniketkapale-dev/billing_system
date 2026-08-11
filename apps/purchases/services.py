from decimal import Decimal

from django.db import transaction

from apps.inventory.batch_service import BatchInventoryService
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
        self.batch_service = BatchInventoryService()

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
            available = self.batch_service.get_available_for_sale(business_id, product_id)
            if requested_qty > available:
                product = Product.objects.get(pk=product_id)
                raise ValidationException(
                    f"Insufficient stock for {product.name}. "
                    f"Available: {available}, requested: {requested_qty}."
                )

        data["owner_id"] = user.id
        data["total_amount"] = total_amount
        purchase = self.repository.create(**data)

        total_cost = Decimal("0")
        total_profit = Decimal("0")

        for item in prepared_items:
            purchase_item = PurchaseItem.objects.create(
                purchase=purchase,
                product=item["product"],
                quantity=item["quantity"],
                unit_price=item["unit_price"],
                line_total=item["line_total"],
            )
            slices = self.batch_service.consume_fifo(
                business_id,
                item["product"].id,
                item["quantity"],
                reference_type=BatchInventoryService.REF_CUSTOMER_SALE,
                reference_id=purchase_item.id,
                selling_price=item["unit_price"],
                purchase_item=purchase_item,
            )
            line_cost = sum(
                (s["purchase_price"] * s["quantity"] for s in slices),
                Decimal("0"),
            )
            line_profit = sum(
                (s["profit"] for s in slices),
                Decimal("0"),
            )
            purchase_item.cost_amount = line_cost
            purchase_item.profit_amount = line_profit
            purchase_item.save(update_fields=["cost_amount", "profit_amount", "updated_at"])

            total_cost += line_cost
            total_profit += line_profit

            self.inventory_service.deduct_stock(
                business_id,
                item["product"].id,
                item["quantity"],
            )

        purchase.total_cost = total_cost
        purchase.total_profit = total_profit
        purchase.save(update_fields=["total_cost", "total_profit", "updated_at"])

        return purchase

    def update_header(self, pk, data):
        purchase = self.repository.get_by_id(pk)
        updates = {}

        if "customer_name" in data:
            customer_name = (data.get("customer_name") or "").strip()
            validate_required(customer_name, "Customer name")
            updates["customer_name"] = customer_name

        if "purchase_date" in data and data.get("purchase_date") is not None:
            updates["purchase_date"] = data["purchase_date"]

        if "reference_no" in data:
            updates["reference_no"] = (data.get("reference_no") or "").strip()

        if "notes" in data:
            updates["notes"] = data.get("notes") or ""

        if not updates:
            return purchase

        return self.repository.update(purchase, **updates)
