from decimal import Decimal

from django.db.models import Sum

from apps.invoicing.models import InventoryBatch, PurchaseInvoice
from core.base_repository import BaseRepository


class PurchaseInvoiceRepository(BaseRepository):
    model = PurchaseInvoice

    def get_queryset(self):
        return super().get_queryset().select_related("business").prefetch_related("items__product")


class InventoryBatchRepository(BaseRepository):
    model = InventoryBatch

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .select_related(
                "product",
                "product__unit",
                "business",
                "purchase_invoice_item",
                "purchase_invoice_item__purchase_invoice",
            )
        )

    def get_fifo_batches(self, business_id, product_id):
        return self.get_queryset().filter(
            business_id=business_id,
            product_id=product_id,
            available_quantity__gt=0,
            is_deleted=False,
            is_active=True,
        ).order_by("created_at", "id")

    def get_total_available(self, business_id, product_id):
        total = self.get_queryset().filter(
            business_id=business_id,
            product_id=product_id,
            is_deleted=False,
            is_active=True,
        ).aggregate(total=Sum("available_quantity"))["total"]
        return Decimal(total or 0)
