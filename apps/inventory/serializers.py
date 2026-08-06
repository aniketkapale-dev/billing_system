from decimal import Decimal

from rest_framework import serializers

from apps.inventory.models import InventoryStock
from core.base_serializer import BaseModelSerializer


class InventoryStockSerializer(BaseModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    product_unit = serializers.CharField(source="product.unit", read_only=True)
    product_purchase_price = serializers.DecimalField(
        source="product.purchase_price",
        max_digits=12,
        decimal_places=2,
        read_only=True,
    )
    product_sale_price = serializers.DecimalField(
        source="product.sale_price",
        max_digits=12,
        decimal_places=2,
        read_only=True,
    )
    profit_per_unit = serializers.SerializerMethodField()
    total_profit = serializers.SerializerMethodField()
    business_name = serializers.CharField(source="business.name", read_only=True)

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
            "product_purchase_price",
            "product_sale_price",
            "quantity",
            "profit_per_unit",
            "total_profit",
            "is_active",
            "created_at",
            "updated_at",
        )

    def get_profit_per_unit(self, obj):
        sale = Decimal(obj.product.sale_price or 0)
        cost = Decimal(obj.product.purchase_price or 0)
        return sale - cost

    def get_total_profit(self, obj):
        return self.get_profit_per_unit(obj) * Decimal(obj.quantity or 0)
