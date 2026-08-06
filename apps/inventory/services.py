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
