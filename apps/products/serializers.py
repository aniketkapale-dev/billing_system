from rest_framework import serializers

from apps.catalog.models import Brand, Category, Unit
from apps.products.models import Product
from core.base_serializer import BaseModelSerializer


class ProductSerializer(BaseModelSerializer):
    owner_name = serializers.CharField(source="owner.full_name", read_only=True)
    business_name = serializers.CharField(source="business.business_name", read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True)
    brand_name = serializers.CharField(source="brand.name", read_only=True)
    unit_name = serializers.CharField(source="unit.name", read_only=True)
    unit_short_name = serializers.CharField(source="unit.short_name", read_only=True)
    quantity = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = (
            "id",
            "owner",
            "owner_name",
            "business",
            "business_name",
            "category",
            "category_name",
            "brand",
            "brand_name",
            "unit",
            "unit_name",
            "unit_short_name",
            "name",
            "sku",
            "barcode",
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
    category_id = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.none(),
        source="category",
        required=False,
        allow_null=True,
    )
    brand_id = serializers.PrimaryKeyRelatedField(
        queryset=Brand.objects.none(),
        source="brand",
        required=False,
        allow_null=True,
    )
    unit_id = serializers.PrimaryKeyRelatedField(
        queryset=Unit.objects.none(),
        source="unit",
    )
    quantity = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=0, required=False, default=0, write_only=True
    )
    purchase_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, required=True)
    sale_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, required=True)

    class Meta:
        model = Product
        fields = (
            "name",
            "sku",
            "barcode",
            "category_id",
            "brand_id",
            "unit_id",
            "description",
            "purchase_price",
            "sale_price",
            "quantity",
            "is_active",
        )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if not request:
            return
        try:
            from core.business_scope import get_owned_business

            business = get_owned_business(request)
        except Exception:
            return
        self.fields["category_id"].queryset = Category.objects.filter(
            business_id=business.id,
            is_deleted=False,
            is_active=True,
        )
        self.fields["brand_id"].queryset = Brand.objects.filter(
            business_id=business.id,
            is_deleted=False,
            is_active=True,
        )
        self.fields["unit_id"].queryset = Unit.objects.filter(
            business_id=business.id,
            is_deleted=False,
            is_active=True,
        )
