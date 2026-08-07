from decimal import Decimal

from django.db.models import F, Sum

from apps.invoicing.models import BatchConsumption, InventoryBatch
from apps.inventory.repositories import InventoryStockRepository
from core.base_service import BaseService
from core.exceptions import ValidationException


class InventoryStockService(BaseService):
    def __init__(self):
        super().__init__(repository=InventoryStockRepository())

    def add_stock(self, business_id, product_id, quantity):
        return self.repository.add_quantity(business_id, product_id, quantity)

    def set_stock(self, business_id, product_id, quantity):
        return self.repository.set_quantity(business_id, product_id, quantity)

    def get_available_quantity(self, business_id, product_id):
        return self.repository.get_available_quantity(business_id, product_id)

    def deduct_stock(self, business_id, product_id, quantity):
        try:
            return self.repository.deduct_quantity(business_id, product_id, quantity)
        except ValueError as exc:
            raise ValidationException(str(exc)) from exc

    def get_profit_summary(self, business_id):
        batch_qs = InventoryBatch.objects.filter(
            business_id=business_id,
            is_deleted=False,
            is_active=True,
        )

        unrealized = batch_qs.filter(available_quantity__gt=0).aggregate(
            total=Sum(
                F("available_quantity") * (F("product__sale_price") - F("purchase_price"))
            )
        )["total"] or Decimal("0")

        stock_cost = batch_qs.filter(available_quantity__gt=0).aggregate(
            total=Sum(F("available_quantity") * F("purchase_price"))
        )["total"] or Decimal("0")

        stock_value = batch_qs.filter(available_quantity__gt=0).aggregate(
            total=Sum(F("available_quantity") * F("product__sale_price"))
        )["total"] or Decimal("0")

        realized = BatchConsumption.objects.filter(
            inventory_batch__business_id=business_id,
            is_deleted=False,
        ).aggregate(total=Sum("profit"))["total"] or Decimal("0")

        return {
            "realized_profit": realized,
            "unrealized_profit": unrealized,
            "stock_cost": stock_cost,
            "stock_value": stock_value,
            "total_profit": realized + unrealized,
        }
