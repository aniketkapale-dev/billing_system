from rest_framework import serializers

from apps.invoicing.models import InventoryBatch, PurchaseInvoice, PurchaseInvoiceItem
from core.base_serializer import BaseModelSerializer
from core.utils import build_absolute_uri

ALLOWED_ATTACHMENT_EXTENSIONS = {"pdf", "jpg", "jpeg", "png", "webp", "gif"}
MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024


def validate_purchase_attachment(file_obj):
    if not file_obj:
        return file_obj
    ext = file_obj.name.rsplit(".", 1)[-1].lower() if "." in file_obj.name else ""
    if ext not in ALLOWED_ATTACHMENT_EXTENSIONS:
        raise serializers.ValidationError("Only PDF and image files are allowed.")
    if file_obj.size > MAX_ATTACHMENT_SIZE:
        raise serializers.ValidationError("File size must be 5 MB or less.")
    return file_obj


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
    attachment_url = serializers.SerializerMethodField()
    attachment_name = serializers.SerializerMethodField()

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
            "attachment",
            "attachment_url",
            "attachment_name",
            "items",
            "is_active",
            "created_at",
            "updated_at",
        )

    def get_attachment_url(self, obj):
        request = self.context.get("request")
        return build_absolute_uri(request, obj.attachment)

    def get_attachment_name(self, obj):
        if not obj.attachment:
            return ""
        return obj.attachment.name.rsplit("/", 1)[-1]


class PurchaseInvoiceHeaderWriteSerializer(serializers.Serializer):
    invoice_number = serializers.CharField(max_length=50, required=False)
    invoice_date = serializers.DateField(required=False, allow_null=True)
    remarks = serializers.CharField(required=False, allow_blank=True, default="")
    attachment = serializers.FileField(required=False, allow_null=True)

    def validate_attachment(self, value):
        return validate_purchase_attachment(value)


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
    attachment = serializers.FileField(required=False, allow_null=True)
    items = PurchaseInvoiceItemWriteSerializer(many=True)

    def validate_attachment(self, value):
        return validate_purchase_attachment(value)


class InventoryBatchSerializer(BaseModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    product_unit = serializers.CharField(source="product.unit.short_name", read_only=True)
    product_sale_price = serializers.DecimalField(
        source="product.sale_price",
        max_digits=12,
        decimal_places=2,
        read_only=True,
    )
    unit_profit = serializers.SerializerMethodField()
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
            "product_sale_price",
            "batch_number",
            "purchase_price",
            "selling_price",
            "unit_profit",
            "purchased_quantity",
            "available_quantity",
            "manufacture_date",
            "expiry_date",
            "invoice_number",
            "is_active",
            "created_at",
            "updated_at",
        )

    def get_unit_profit(self, obj):
        from decimal import Decimal

        sale_price = Decimal(obj.product.sale_price or 0)
        batch_cost = Decimal(obj.purchase_price or 0)
        return sale_price - batch_cost

    def get_invoice_number(self, obj):
        item = obj.purchase_invoice_item
        if item and item.purchase_invoice:
            return item.purchase_invoice.invoice_number
        return "Opening Stock"
