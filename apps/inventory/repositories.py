from decimal import Decimal

from django.db.models import F
from django.utils import timezone

from apps.inventory.models import InventoryStock
from core.middleware import get_current_ip, get_current_user
from apps.products.models import Product
from core.base_repository import BaseRepository


class InventoryStockRepository(BaseRepository):
    model = InventoryStock

    def get_queryset(self):
        return super().get_queryset().select_related("product", "product__unit", "owner", "business")

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

    def _touch(self):
        user = get_current_user()
        return {
            "updated_at": timezone.now(),
            "updated_by": getattr(user, "id", None),
            "updated_ip": get_current_ip(),
        }

    def add_quantity(self, business_id, product_id, quantity):
        stock = self.get_or_create_stock(business_id, product_id)
        self.model.objects.filter(pk=stock.pk).update(
            quantity=F("quantity") + Decimal(quantity),
            **self._touch(),
        )
        stock.refresh_from_db(fields=["quantity", "updated_at"])
        return stock

    def set_quantity(self, business_id, product_id, quantity):
        stock = self.get_or_create_stock(business_id, product_id)
        self.model.objects.filter(pk=stock.pk).update(
            quantity=Decimal(quantity),
            **self._touch(),
        )
        stock.quantity = Decimal(quantity)
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
        updated = self.model.objects.filter(
            pk=stock.pk,
            quantity__gte=qty,
        ).update(
            quantity=F("quantity") - qty,
            **self._touch(),
        )
        if not updated:
            product = Product.objects.only("name").get(pk=product_id)
            available = self.get_available_quantity(business_id, product_id)
            raise ValueError(
                f"Insufficient stock for {product.name}. Available: {available}, requested: {qty}."
            )
        stock.refresh_from_db(fields=["quantity", "updated_at"])
        return stock
