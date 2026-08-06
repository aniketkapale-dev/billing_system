from decimal import Decimal

from apps.inventory.models import InventoryStock
from apps.products.models import Product
from core.base_repository import BaseRepository


class InventoryStockRepository(BaseRepository):
    model = InventoryStock

    def get_queryset(self):
        return super().get_queryset().select_related("product", "owner", "business")

    def get_or_create_stock(self, business_id, product_id):
        product = Product.objects.get(pk=product_id)
        stock, _ = self.model.objects.get_or_create(
            business_id=business_id,
            product_id=product_id,
            defaults={
                "owner_id": product.owner_id,
                "quantity": Decimal("0"),
            },
        )
        return stock

    def add_quantity(self, business_id, product_id, quantity):
        stock = self.get_or_create_stock(business_id, product_id)
        stock.quantity = Decimal(stock.quantity) + Decimal(quantity)
        stock.save(update_fields=["quantity", "updated_at"])
        return stock

    def set_quantity(self, business_id, product_id, quantity):
        stock = self.get_or_create_stock(business_id, product_id)
        stock.quantity = Decimal(quantity)
        stock.save(update_fields=["quantity", "updated_at"])
        return stock

    def get_available_quantity(self, business_id, product_id):
        stock = self.model.objects.filter(
            business_id=business_id,
            product_id=product_id,
            is_deleted=False,
        ).first()
        if not stock:
            return Decimal("0")
        return Decimal(stock.quantity)

    def deduct_quantity(self, business_id, product_id, quantity):
        stock = self.get_or_create_stock(business_id, product_id)
        qty = Decimal(quantity)
        available = Decimal(stock.quantity)
        if qty > available:
            product = Product.objects.get(pk=product_id)
            raise ValueError(
                f"Insufficient stock for {product.name}. Available: {available}, requested: {qty}."
            )
        stock.quantity = available - qty
        stock.save(update_fields=["quantity", "updated_at"])
        return stock
