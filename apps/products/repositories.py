from decimal import Decimal

from django.db.models import OuterRef, Prefetch, Q, Subquery, Sum, Value, DecimalField
from django.db.models.functions import Coalesce

from apps.inventory.models import InventoryStock
from apps.invoicing.models import InventoryBatch
from apps.products.models import Product
from core.base_repository import BaseRepository


class ProductRepository(BaseRepository):
    model = Product

    def get_queryset(self):
        active_stocks = InventoryStock.objects.filter(is_deleted=False)
        opening_batches = InventoryBatch.objects.filter(
            product_id=OuterRef("pk"),
            is_deleted=False,
            purchase_invoice_item__isnull=True,
        )
        opening_batch_total = opening_batches.values("product_id").annotate(
            total=Sum("purchased_quantity"),
        ).values("total")
        opening_batch_first_added = opening_batches.order_by("created_at").values("created_at")
        return (
            super()
            .get_queryset()
            .select_related("owner", "business", "category", "brand", "manufacturer", "unit", "tax")
            .prefetch_related(Prefetch("inventory_stocks", queryset=active_stocks))
            .annotate(
                sold_quantity=Coalesce(
                    Sum(
                        "purchase_items__quantity",
                        filter=Q(
                            purchase_items__is_deleted=False,
                            purchase_items__purchase__is_deleted=False,
                        ),
                    ),
                    Value(Decimal("0")),
                    output_field=DecimalField(max_digits=12, decimal_places=2),
                ),
                opening_quantity=Coalesce(
                    Subquery(opening_batch_total[:1]),
                    Value(Decimal("0")),
                    output_field=DecimalField(max_digits=12, decimal_places=2),
                ),
                opening_added_at=Subquery(opening_batch_first_added[:1]),
            )
        )
