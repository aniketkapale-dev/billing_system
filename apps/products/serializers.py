from rest_framework import serializers

from apps.products.models import Product
from core.base_serializer import BaseModelSerializer


class ProductSerializer(BaseModelSerializer):
    owner_name = serializers.CharField(source="owner.full_name", read_only=True)
    business_name = serializers.CharField(source="business.name", read_only=True)
    quantity = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = (
            "id",
            "owner",
            "owner_name",
            "business",
            "business_name",
            "name",
            "sku",
            "unit",
            "description",
            "purchase_price",
            "sale_price",
            "quantity",
            "is_active",
            "is_deleted",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("owner", "business")

    def get_quantity(self, obj):
        stocks = obj.inventory_stocks.all()
        if stocks:
            return stocks[0].quantity
        return 0


class ProductWriteSerializer(serializers.ModelSerializer):
    purchase_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, required=False, default=0)
    sale_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, required=False, default=0)
    quantity = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, required=False, default=0, write_only=True)

    class Meta:
        model = Product
        fields = (
            "name",
            "sku",
            "unit",
            "description",
            "purchase_price",
            "sale_price",
            "quantity",
            "is_active",
        )
