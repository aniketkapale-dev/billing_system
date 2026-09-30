from decimal import Decimal

from django.db.models import DecimalField, OuterRef, Prefetch, Subquery, Sum, Value
from django.db.models.functions import Coalesce

from apps.purchases.models import Purchase, PurchaseItem, PurchasePayment
from core.base_repository import BaseRepository


class PurchaseRepository(BaseRepository):
    model = Purchase

    def get_list_queryset(self):
        """Sale table only: customer, line names/qty, and paid total. No batches or payment rows."""
        item_qs = (
            PurchaseItem.objects.filter(is_deleted=False)
            .select_related("product")
            .only("id", "purchase_id", "product_id", "quantity", "product__id", "product__name")
        )
        paid_total = (
            PurchasePayment.objects.filter(purchase_id=OuterRef("pk"), is_deleted=False)
            .values("purchase_id")
            .annotate(total=Sum("amount"))
            .values("total")
        )
        return (
            self.model.objects.select_related("customer")
            .prefetch_related(Prefetch("items", queryset=item_qs))
            .annotate(
                total_paid_amount=Coalesce(
                    Subquery(paid_total[:1]),
                    Value(Decimal("0")),
                    output_field=DecimalField(max_digits=14, decimal_places=2),
                )
            )
        )

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .select_related("owner", "payment_type", "customer", "invoice_setting")
            .prefetch_related(
                "items__product",
                "items__batch_consumptions__inventory_batch",
                Prefetch(
                    "payments",
                    queryset=PurchasePayment.objects.filter(is_deleted=False).select_related(
                        "payment_type"
                    ),
                ),
            )
        )

    def get_for_header_update(self, pk):
        """Header edits do not need line items, payments, or batch consumptions."""
        try:
            return self.model.objects.select_related("customer", "invoice_setting").get(pk=pk)
        except self.model.DoesNotExist as exc:
            from core.exceptions import NotFoundException

            raise NotFoundException(
                f"{self.model.__name__} with id {pk} not found"
            ) from exc

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
