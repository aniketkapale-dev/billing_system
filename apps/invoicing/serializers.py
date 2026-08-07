from rest_framework import serializers

from apps.invoicing.models import InventoryBatch, PurchaseInvoice, PurchaseInvoiceItem
from core.base_serializer import BaseModelSerializer


class PurchaseInvoiceItemSerializer(BaseModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    product_unit = serializers.CharField(source="product.unit.short_name", read_only=True)

    class Meta:
        model = PurchaseInvoiceItem
        fields = (
            "id",
            "product",
            "product_name",
            "product_sku",
            "product_unit",
            "quantity",
            "purchase_price",
            "discount",
            "tax",
            "batch_number",
            "expiry_date",
            "line_total",
        )


class PurchaseInvoiceSerializer(BaseModelSerializer):
    items = PurchaseInvoiceItemSerializer(many=True, read_only=True)
    business_name = serializers.CharField(source="business.business_name", read_only=True)

    class Meta:
        model = PurchaseInvoice
        fields = (
            "id",
            "business",
            "business_name",
            "invoice_number",
            "invoice_date",
            "subtotal",
            "discount",
            "tax",
            "grand_total",
            "remarks",
            "items",
            "is_active",
            "created_at",
            "updated_at",
        )


class PurchaseInvoiceItemWriteSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    quantity = serializers.DecimalField(max_digits=12, decimal_places=2)
    purchase_price = serializers.DecimalField(max_digits=12, decimal_places=2)
    discount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=0)
    tax = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=0)
    batch_number = serializers.CharField(max_length=50, required=False, allow_blank=True, default="")
    expiry_date = serializers.DateField(required=False, allow_null=True)


class PurchaseInvoiceWriteSerializer(serializers.Serializer):
    invoice_number = serializers.CharField(max_length=50)
    invoice_date = serializers.DateField(required=False)
    discount = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, default=0)
    tax = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, default=0)
    remarks = serializers.CharField(required=False, allow_blank=True, default="")
    items = PurchaseInvoiceItemWriteSerializer(many=True)


class InventoryBatchSerializer(BaseModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    product_unit = serializers.CharField(source="product.unit.short_name", read_only=True)
    business_name = serializers.CharField(source="business.business_name", read_only=True)
    invoice_number = serializers.SerializerMethodField()

    class Meta:
        model = InventoryBatch
        fields = (
            "id",
            "business",
            "business_name",
            "product",
            "product_name",
            "product_sku",
            "product_unit",
            "batch_number",
            "purchase_price",
            "selling_price",
            "purchased_quantity",
            "available_quantity",
            "manufacture_date",
            "expiry_date",
            "invoice_number",
            "is_active",
            "created_at",
            "updated_at",
        )

    def get_invoice_number(self, obj):
        item = obj.purchase_invoice_item
        if item and item.purchase_invoice:
            return item.purchase_invoice.invoice_number
        return "Opening Stock"
