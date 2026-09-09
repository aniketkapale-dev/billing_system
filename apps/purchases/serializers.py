from decimal import Decimal

from rest_framework import serializers

from apps.purchases.models import Purchase, PurchaseItem
from core.base_serializer import BaseModelSerializer


class PurchaseItemSerializer(BaseModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    product_unit = serializers.CharField(source="product.unit.short_name", read_only=True)
    batch_lines = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseItem
        fields = (
            "id",
            "product",
            "product_name",
            "product_sku",
            "product_unit",
            "quantity",
            "list_price",
            "unit_price",
            "line_total",
            "discount_amount",
            "discount_type",
            "discount_value",
            "distributor_discount_type",
            "distributor_discount_value",
            "sale_tax_ids",
            "tax_amount",
            "cost_amount",
            "profit_amount",
            "batch_lines",
        )

    def get_batch_lines(self, obj):
        consumptions = [
            consumption
            for consumption in obj.batch_consumptions.all()
            if not consumption.is_deleted
        ]
        if consumptions:
            lines = []
            for consumption in consumptions:
                batch = consumption.inventory_batch
                lines.append({
                    "quantity": consumption.quantity_sold,
                    "batch_number": (batch.batch_number or "").strip(),
                    "expiry_date": batch.expiry_date,
                })
            return lines

        return [{
            "quantity": obj.quantity,
            "batch_number": "",
            "expiry_date": None,
        }]


class PurchaseSerializer(BaseModelSerializer):
    items = PurchaseItemSerializer(many=True, read_only=True)
    business_name = serializers.CharField(source="business.business_name", read_only=True)
    invoice_terms_conditions = serializers.CharField(
        source="invoice_setting.terms_conditions",
        read_only=True,
        default="",
    )
    invoice_qr_image_url = serializers.SerializerMethodField()
    payment_type_name = serializers.CharField(source="payment_type.name", read_only=True, default="")
    customer_mobile = serializers.CharField(source="customer.mobile", read_only=True, default="")
    customer_email = serializers.CharField(source="customer.email", read_only=True, default="")
    customer_gst_number = serializers.CharField(source="customer.gst_number", read_only=True, default="")
    customer_address = serializers.CharField(source="customer.address", read_only=True, default="")
    company_name = serializers.CharField(source="customer.company_name", read_only=True, default="")
    company_address = serializers.CharField(source="customer.business_address", read_only=True, default="")
    total_paid = serializers.SerializerMethodField()
    pending_bill = serializers.SerializerMethodField()
    invoice_setting_id = serializers.IntegerField(read_only=True)
    next_invoice_no = serializers.SerializerMethodField()

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
            "customer_email",
            "customer_gst_number",
            "customer_address",
            "company_name",
            "company_address",
            "supplier_name",
            "reference_no",
            "invoice_setting_id",
            "next_invoice_no",
            "invoice_terms_conditions",
            "invoice_qr_image_url",
            "purchase_date",
            "notes",
            "billing_address",
            "shipping_address",
            "payment_type",
            "payment_type_name",
            "total_amount",
            "total_cost",
            "total_profit",
            "total_paid",
            "pending_bill",
            "is_paid",
            "paid_at",
            "due_date",
            "is_draft",
            "is_cancelled",
            "cancelled_at",
            "cancellation_date",
            "cancellation_reason",
            "items",
            "is_active",
            "created_at",
            "updated_at",
        )

    def get_invoice_qr_image_url(self, obj):
        setting = getattr(obj, "invoice_setting", None)
        if not setting or not setting.qr_image:
            return None
        request = self.context.get("request")
        url = setting.qr_image.url
        if request:
            return request.build_absolute_uri(url)
        return url

    def get_total_paid(self, obj):
        if obj.is_draft or obj.is_cancelled or not obj.is_paid:
            return Decimal("0")
        return obj.total_amount or Decimal("0")

    def get_pending_bill(self, obj):
        if obj.is_draft or obj.is_cancelled or obj.is_paid:
            return Decimal("0")
        return obj.total_amount or Decimal("0")

    def get_next_invoice_no(self, obj):
        reference_no = (obj.reference_no or "").strip()
        if reference_no:
            return reference_no

        setting = getattr(obj, "invoice_setting", None)
        if not setting:
            return ""

        from apps.settings.services import InvoiceSettingService

        setting = InvoiceSettingService().resolve_for_sale(setting)
        return setting.format_invoice_number()


class PurchaseItemWriteSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    quantity = serializers.DecimalField(max_digits=12, decimal_places=2)
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=2)
    list_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    discount_amount = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, default=0)
    discount_type = serializers.ChoiceField(choices=["percent", "amount"], required=False, default="percent")
    discount_value = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=0)
    distributor_discount_type = serializers.ChoiceField(choices=["percent", "amount"], required=False, default="percent")
    distributor_discount_value = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=0)
    sale_tax_ids = serializers.ListField(child=serializers.IntegerField(), required=False, default=list)
    tax_amount = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, default=0)


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
    is_paid = serializers.BooleanField(required=False, default=False)
    due_date = serializers.DateField(required=False, allow_null=True)
    is_draft = serializers.BooleanField(required=False, default=False)
    items = PurchaseItemWriteSerializer(many=True)


class PurchaseFinalizeSerializer(serializers.Serializer):
    is_paid = serializers.BooleanField(required=False, default=False)
    due_date = serializers.DateField(required=False, allow_null=True)


class PurchaseDraftUpdateSerializer(serializers.Serializer):
    customer_id = serializers.IntegerField(required=False)
    purchase_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    billing_address = serializers.CharField(required=False, allow_blank=True)
    shipping_address = serializers.CharField(required=False, allow_blank=True)
    payment_type_id = serializers.IntegerField(required=False, allow_null=True)
    due_date = serializers.DateField(required=False, allow_null=True)
    items = PurchaseItemWriteSerializer(many=True, required=False)


class PurchaseHeaderWriteSerializer(serializers.Serializer):
    customer_id = serializers.IntegerField(required=False)
    purchase_date = serializers.DateField(required=False, allow_null=True)
    reference_no = serializers.CharField(max_length=50, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    billing_address = serializers.CharField(required=False, allow_blank=True)
    shipping_address = serializers.CharField(required=False, allow_blank=True)
    payment_type_id = serializers.IntegerField(required=False, allow_null=True)
    due_date = serializers.DateField(required=False, allow_null=True)
