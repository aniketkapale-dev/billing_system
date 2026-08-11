from decimal import Decimal

from rest_framework import serializers

from apps.catalog.models import Brand, Category, Manufacturer, Unit
from apps.products.models import Product
from core.base_serializer import BaseModelSerializer


class ProductSerializer(BaseModelSerializer):
    owner_name = serializers.CharField(source="owner.full_name", read_only=True)
    business_name = serializers.CharField(source="business.business_name", read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True)
    brand_name = serializers.CharField(source="brand.name", read_only=True)
    manufacturer_name = serializers.CharField(source="manufacturer.name", read_only=True)
    unit_name = serializers.CharField(source="unit.name", read_only=True)
    unit_short_name = serializers.CharField(source="unit.short_name", read_only=True)
    quantity = serializers.SerializerMethodField()
    opening_quantity = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    sold_quantity = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    has_sales = serializers.SerializerMethodField()

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
            "manufacturer",
            "manufacturer_name",
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
            "opening_quantity",
            "sold_quantity",
            "has_sales",
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

    def get_has_sales(self, obj):
        sold = getattr(obj, "sold_quantity", None)
        if sold is not None:
            return Decimal(str(sold)) > 0
        return False


class ProductWriteSerializer(serializers.ModelSerializer):
    category_id = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.none(),
        source="category",
        required=True,
        allow_null=False,
    )
    brand_id = serializers.PrimaryKeyRelatedField(
        queryset=Brand.objects.none(),
        source="brand",
        required=False,
        allow_null=True,
    )
    manufacturer_id = serializers.PrimaryKeyRelatedField(
        queryset=Manufacturer.objects.none(),
        source="manufacturer",
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
    purchase_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, required=False, default=0)
    sale_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, required=False, default=0)

    def validate_sku(self, value):
        return (value or "").strip()

    class Meta:
        model = Product
        fields = (
            "name",
            "sku",
            "barcode",
            "category_id",
            "brand_id",
            "manufacturer_id",
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
        self.fields["manufacturer_id"].queryset = Manufacturer.objects.filter(
            business_id=business.id,
            is_deleted=False,
            is_active=True,
        )
        self.fields["unit_id"].queryset = Unit.objects.filter(
            business_id=business.id,
            is_deleted=False,
            is_active=True,
        )
