from decimal import Decimal

from django.db.models import Prefetch

from apps.inventory.models import InventoryStock
from apps.products.models import Product
from core.base_repository import BaseRepository


class ProductRepository(BaseRepository):
    model = Product

    def get_queryset(self):
        active_stocks = InventoryStock.objects.filter(is_deleted=False)
        return (
            super()
            .get_queryset()
            .select_related("owner", "business")
            .prefetch_related(Prefetch("inventory_stocks", queryset=active_stocks))
        )
