from apps.purchases.models import Purchase, PurchaseItem
from core.base_repository import BaseRepository


class PurchaseRepository(BaseRepository):
    model = Purchase

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .select_related("owner", "payment_type", "customer", "invoice_setting")
            .prefetch_related("items__product", "items__batch_consumptions__inventory_batch")
        )

    def get_by_id(self, pk, include_deleted=False):
        qs = self.model.all_objects if include_deleted else self.get_queryset()
        try:
            return qs.get(pk=pk)
        except self.model.DoesNotExist as exc:
            from core.exceptions import NotFoundException

            raise NotFoundException(
                f"{self.model.__name__} with id {pk} not found"
            ) from exc


class PurchaseItemRepository(BaseRepository):
    model = PurchaseItem
