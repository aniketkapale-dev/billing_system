from apps.purchases.models import Purchase, PurchaseItem
from core.base_repository import BaseRepository


class PurchaseRepository(BaseRepository):
    model = Purchase

    def get_queryset(self):
        return super().get_queryset().select_related("owner").prefetch_related("items__product")


class PurchaseItemRepository(BaseRepository):
    model = PurchaseItem
