from decimal import Decimal

from rest_framework import serializers

from apps.inventory.models import InventoryStock
from core.base_serializer import BaseModelSerializer


class InventoryStockSerializer(BaseModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    product_unit = serializers.CharField(source="product.unit.short_name", read_only=True)
    avg_batch_cost = serializers.SerializerMethodField()
    avg_batch_sell = serializers.SerializerMethodField()
    profit_per_unit = serializers.SerializerMethodField()
    total_profit = serializers.SerializerMethodField()
    batch_available = serializers.SerializerMethodField()
    business_name = serializers.CharField(source="business.business_name", read_only=True)
    purchase_sources = serializers.SerializerMethodField()

    class Meta:
        model = InventoryStock
        fields = (
            "id",
            "owner",
            "business",
            "business_name",
            "product",
            "product_name",
            "product_sku",
            "product_unit",
            "avg_batch_cost",
            "avg_batch_sell",
            "quantity",
            "batch_available",
            "profit_per_unit",
            "total_profit",
            "purchase_sources",
            "is_active",
            "created_at",
            "updated_at",
        )

    def _get_product_batches(self, obj):
        from apps.invoicing.models import InventoryBatch

        return InventoryBatch.objects.filter(
            business_id=obj.business_id,
            product_id=obj.product_id,
            is_deleted=False,
            is_active=True,
            available_quantity__gt=0,
        )

    def _product_sale_price(self, obj):
        return Decimal(obj.product.sale_price or 0)

    def _batch_unit_profit(self, batch, sale_price):
        return sale_price - Decimal(batch.purchase_price or 0)

    def get_batch_available(self, obj):
        batches = self._get_product_batches(obj)
        return sum((Decimal(b.available_quantity) for b in batches), Decimal("0"))

    def _batch_weighted_averages(self, obj):
        batches = self._get_product_batches(obj)
        total_qty = Decimal("0")
        total_cost = Decimal("0")
        sale_price = self._product_sale_price(obj)
        for batch in batches:
            qty = Decimal(batch.available_quantity or 0)
            total_qty += qty
            total_cost += Decimal(batch.purchase_price or 0) * qty
        if total_qty <= 0:
            return Decimal("0"), sale_price, Decimal("0")
        return total_cost / total_qty, sale_price, total_qty

    def get_avg_batch_cost(self, obj):
        cost, _, qty = self._batch_weighted_averages(obj)
        return cost if qty > 0 else Decimal("0")

    def get_avg_batch_sell(self, obj):
        _, sell, qty = self._batch_weighted_averages(obj)
        return sell if qty > 0 else Decimal("0")

    def get_profit_per_unit(self, obj):
        cost, sell, qty = self._batch_weighted_averages(obj)
        if qty <= 0:
            return Decimal("0")
        return sell - cost

    def get_total_profit(self, obj):
        sale_price = self._product_sale_price(obj)
        batches = self._get_product_batches(obj)
        return sum(
            (
                self._batch_unit_profit(batch, sale_price) * Decimal(batch.available_quantity or 0)
                for batch in batches
            ),
            Decimal("0"),
        )

    def get_purchase_sources(self, obj):
        batches = (
            self._get_product_batches(obj)
            .select_related("purchase_invoice_item__purchase_invoice")
            .order_by("created_at", "id")
        )
        sources = []
        for batch in batches:
            invoice_number = "Opening Stock"
            invoice_date = None
            item = batch.purchase_invoice_item
            invoice = getattr(item, "purchase_invoice", None) if item else None
            if invoice and not invoice.is_deleted:
                invoice_number = invoice.invoice_number
                invoice_date = invoice.invoice_date
            sources.append({
                "invoice_number": invoice_number,
                "invoice_date": invoice_date,
                "batch_number": batch.batch_number or "",
                "available_quantity": batch.available_quantity,
                "purchase_price": batch.purchase_price,
            })
        return sources
