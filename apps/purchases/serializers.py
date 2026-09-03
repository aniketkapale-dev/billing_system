from rest_framework import serializers

from apps.purchases.models import Purchase, PurchaseItem
from core.base_serializer import BaseModelSerializer


class PurchaseItemSerializer(BaseModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    product_unit = serializers.CharField(source="product.unit.short_name", read_only=True)

    class Meta:
        model = PurchaseItem
        fields = (
            "id",
            "product",
            "product_name",
            "product_sku",
            "product_unit",
            "quantity",
            "unit_price",
            "line_total",
            "cost_amount",
            "profit_amount",
        )


class PurchaseSerializer(BaseModelSerializer):
    items = PurchaseItemSerializer(many=True, read_only=True)
    business_name = serializers.CharField(source="business.business_name", read_only=True)
    payment_type_name = serializers.CharField(source="payment_type.name", read_only=True, default="")
    customer_mobile = serializers.CharField(source="customer.mobile", read_only=True, default="")
    company_name = serializers.CharField(source="customer.company_name", read_only=True, default="")

    class Meta:
        model = Purchase
        fields = (
            "id",
            "owner",
            "business",
            "business_name",
            "customer",
            "customer_name",
            "customer_mobile",
            "company_name",
            "supplier_name",
            "reference_no",
            "purchase_date",
            "notes",
            "billing_address",
            "shipping_address",
            "payment_type",
            "payment_type_name",
            "total_amount",
            "total_cost",
            "total_profit",
            "items",
            "is_active",
            "created_at",
            "updated_at",
        )


class PurchaseItemWriteSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    quantity = serializers.DecimalField(max_digits=12, decimal_places=2)
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=2)


class PurchaseWriteSerializer(serializers.Serializer):
    customer_id = serializers.IntegerField()
    invoice_setting_id = serializers.IntegerField()
    supplier_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    reference_no = serializers.CharField(max_length=50, required=False, allow_blank=True)
    purchase_date = serializers.DateField(required=False)
    notes = serializers.CharField(required=False, allow_blank=True)
    billing_address = serializers.CharField(required=False, allow_blank=True)
    shipping_address = serializers.CharField(required=False, allow_blank=True)
    payment_type_id = serializers.IntegerField(required=False, allow_null=True)
    items = PurchaseItemWriteSerializer(many=True)


class PurchaseHeaderWriteSerializer(serializers.Serializer):
    customer_id = serializers.IntegerField(required=False)
    purchase_date = serializers.DateField(required=False, allow_null=True)
    reference_no = serializers.CharField(max_length=50, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    billing_address = serializers.CharField(required=False, allow_blank=True)
    shipping_address = serializers.CharField(required=False, allow_blank=True)
    payment_type_id = serializers.IntegerField(required=False, allow_null=True)
