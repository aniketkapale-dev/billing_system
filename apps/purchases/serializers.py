from decimal import Decimal

from django.db.models import Sum
from rest_framework import serializers

from apps.purchases.models import Purchase, PurchaseItem, PurchasePayment, SaleDueSetting
from core.base_serializer import BaseModelSerializer


def _decimal_str(value):
    amount = Decimal(value or 0)
    return format(amount.quantize(Decimal("0.01")), "f")


class OptionalDateField(serializers.DateField):
    def to_internal_value(self, data):
        if data in ("", None):
            return None
        return super().to_internal_value(data)


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
                    "quantity": _decimal_str(consumption.quantity_sold),
                    "batch_number": (batch.batch_number or "").strip(),
                    "expiry_date": batch.expiry_date,
                })
            return lines

        return [{
            "quantity": _decimal_str(obj.quantity),
            "batch_number": "",
            "expiry_date": None,
        }]


class PurchasePaymentSerializer(BaseModelSerializer):
    payment_type_name = serializers.CharField(source="payment_type.name", read_only=True, default="")

    class Meta:
        model = PurchasePayment
        fields = (
            "id",
            "amount",
            "payment_date",
            "next_due_date",
            "payment_type",
            "payment_type_name",
            "notes",
            "created_at",
        )


class PurchaseListItemSerializer(serializers.Serializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    quantity = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)


class PurchaseListSerializer(BaseModelSerializer):
    items = PurchaseListItemSerializer(many=True, read_only=True)
    company_name = serializers.SerializerMethodField()
    customer_mobile = serializers.SerializerMethodField()
    total_paid = serializers.SerializerMethodField()
    pending_bill = serializers.SerializerMethodField()
    payment_status = serializers.SerializerMethodField()

    class Meta:
        model = Purchase
        fields = (
            "id",
            "customer_name",
            "company_name",
            "customer_mobile",
            "reference_no",
            "purchase_date",
            "total_amount",
            "total_paid",
            "pending_bill",
            "payment_status",
            "is_paid",
            "is_draft",
            "is_cancelled",
            "items",
        )

    def get_company_name(self, obj):
        customer = getattr(obj, "customer", None)
        return customer.company_name if customer else ""

    def get_customer_mobile(self, obj):
        customer = getattr(obj, "customer", None)
        return customer.mobile if customer else ""

    def _paid_amount(self, obj):
        annotated = getattr(obj, "total_paid_amount", None)
        if annotated is not None:
            return Decimal(annotated or 0)
        return Decimal("0")

    def get_total_paid(self, obj):
        if obj.is_draft or obj.is_cancelled:
            return "0.00"
        return _decimal_str(self._paid_amount(obj))

    def get_pending_bill(self, obj):
        if obj.is_draft or obj.is_cancelled:
            return "0.00"
        pending = Decimal(obj.total_amount or 0) - self._paid_amount(obj)
        if pending < 0:
            return "0.00"
        return _decimal_str(pending)

    def get_payment_status(self, obj):
        if obj.is_draft:
            return "draft"
        if obj.is_cancelled:
            return "cancelled"
        if obj.is_paid:
            return "paid"
        total_paid = self._paid_amount(obj)
        total_amount = Decimal(obj.total_amount or 0)
        if total_paid <= 0:
            return "unpaid"
        if total_paid + Decimal("0.0001") < total_amount:
            return "partial"
        return "paid"


class PurchaseSerializer(BaseModelSerializer):
    items = PurchaseItemSerializer(many=True, read_only=True)
    payments = PurchasePaymentSerializer(many=True, read_only=True)
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
    company_mobile = serializers.CharField(source="customer.company_mobile", read_only=True, default="")
    company_address = serializers.CharField(source="customer.business_address", read_only=True, default="")
    total_paid = serializers.SerializerMethodField()
    pending_bill = serializers.SerializerMethodField()
    payment_status = serializers.SerializerMethodField()
    total_cost_without_tax = serializers.SerializerMethodField()
    total_cost_tax = serializers.SerializerMethodField()
    total_cost_with_tax = serializers.SerializerMethodField()
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
            "company_mobile",
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
            "total_cost_without_tax",
            "total_cost_tax",
            "total_cost_with_tax",
            "total_profit",
            "total_paid",
            "pending_bill",
            "payment_status",
            "payments",
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

    def _sum_payments(self, obj):
        payments = getattr(obj, "_prefetched_objects_cache", {}).get("payments")
        if payments is not None:
            return sum(
                (payment.amount for payment in payments if not payment.is_deleted),
                Decimal("0"),
            )
        total = (
            PurchasePayment.objects.filter(purchase=obj, is_deleted=False)
            .aggregate(total=Sum("amount"))
            .get("total")
        )
        return total or Decimal("0")

    def get_total_paid(self, obj):
        if obj.is_draft or obj.is_cancelled:
            return "0.00"
        return _decimal_str(self._sum_payments(obj))

    def get_pending_bill(self, obj):
        if obj.is_draft or obj.is_cancelled:
            return "0.00"
        total_amount = obj.total_amount or Decimal("0")
        pending = total_amount - self._sum_payments(obj)
        if pending < 0:
            return "0.00"
        return _decimal_str(pending)

    def get_payment_status(self, obj):
        if obj.is_draft:
            return "draft"
        if obj.is_cancelled:
            return "cancelled"
        total_paid = self._sum_payments(obj)
        total_amount = obj.total_amount or Decimal("0")
        if total_paid <= 0:
            return "unpaid"
        if total_paid + Decimal("0.0001") < total_amount:
            return "partial"
        return "paid"

    def _cost_breakdown(self, obj):
        cached = getattr(obj, "_cached_cost_breakdown", None)
        if cached is not None:
            return cached

        total_with_tax = Decimal(obj.total_cost or 0)
        total_tax = Decimal("0")
        has_consumption_tax = False

        items = getattr(obj, "_prefetched_objects_cache", {}).get("items")
        if items is None:
            items = obj.items.filter(is_deleted=False)

        for item in items:
            if getattr(item, "is_deleted", False):
                continue
            consumptions = getattr(item, "_prefetched_objects_cache", {}).get("batch_consumptions")
            if consumptions is None:
                consumptions = item.batch_consumptions.filter(is_deleted=False)

            for consumption in consumptions:
                if getattr(consumption, "is_deleted", False):
                    continue
                qty = Decimal(consumption.quantity_sold or 0)
                if qty <= 0:
                    continue

                invoice_item = None
                batch = getattr(consumption, "inventory_batch", None)
                if batch is not None:
                    invoice_item = getattr(batch, "purchase_invoice_item", None)

                if (
                    invoice_item
                    and invoice_item.quantity
                    and Decimal(invoice_item.quantity) > 0
                ):
                    tax_per_unit = Decimal(invoice_item.tax or 0) / Decimal(invoice_item.quantity)
                    total_tax += tax_per_unit * qty
                    has_consumption_tax = True

        total_tax = total_tax.quantize(Decimal("0.01"))
        if not has_consumption_tax:
            total_tax = Decimal("0")

        total_with_tax = total_with_tax.quantize(Decimal("0.01"))
        total_without_tax = (total_with_tax - total_tax).quantize(Decimal("0.01"))
        if total_without_tax < 0:
            total_without_tax = Decimal("0.00")

        breakdown = (total_without_tax, total_tax, total_with_tax)
        obj._cached_cost_breakdown = breakdown
        return breakdown

    def get_total_cost_without_tax(self, obj):
        if obj.is_draft:
            return None
        return _decimal_str(self._cost_breakdown(obj)[0])

    def get_total_cost_tax(self, obj):
        if obj.is_draft:
            return None
        return _decimal_str(self._cost_breakdown(obj)[1])

    def get_total_cost_with_tax(self, obj):
        if obj.is_draft:
            return None
        return _decimal_str(self._cost_breakdown(obj)[2])

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
    invoice_setting_id = serializers.IntegerField(required=False, allow_null=True)
    supplier_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    reference_no = serializers.CharField(max_length=50, required=False, allow_blank=True)
    purchase_date = serializers.DateField(required=False)
    notes = serializers.CharField(required=False, allow_blank=True)
    billing_address = serializers.CharField(required=False, allow_blank=True)
    shipping_address = serializers.CharField(required=False, allow_blank=True)
    payment_type_id = serializers.IntegerField(required=False, allow_null=True)
    is_paid = serializers.BooleanField(required=False, default=False)
    due_date = OptionalDateField(required=False, allow_null=True)
    payment_amount = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        required=False,
        allow_null=True,
    )
    is_draft = serializers.BooleanField(required=False, default=False)
    items = PurchaseItemWriteSerializer(many=True)

    def validate(self, attrs):
        is_draft = attrs.get("is_draft", False)
        if not is_draft and not attrs.get("invoice_setting_id"):
            raise serializers.ValidationError(
                {"invoice_setting_id": "Invoice setting is required."}
            )
        return attrs


class PurchaseFinalizeSerializer(serializers.Serializer):
    invoice_setting_id = serializers.IntegerField()
    is_paid = serializers.BooleanField(required=False, default=False)
    due_date = OptionalDateField(required=False, allow_null=True)
    payment_amount = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        required=False,
        allow_null=True,
    )


class PurchasePaymentWriteSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    payment_date = OptionalDateField(required=False)
    next_due_date = OptionalDateField(required=False, allow_null=True)
    payment_type_id = serializers.IntegerField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class PurchaseDraftUpdateSerializer(serializers.Serializer):
    customer_id = serializers.IntegerField(required=False)
    purchase_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    billing_address = serializers.CharField(required=False, allow_blank=True)
    shipping_address = serializers.CharField(required=False, allow_blank=True)
    payment_type_id = serializers.IntegerField(required=False, allow_null=True)
    due_date = OptionalDateField(required=False, allow_null=True)
    items = PurchaseItemWriteSerializer(many=True, required=False)


class PurchaseHeaderWriteSerializer(serializers.Serializer):
    customer_id = serializers.IntegerField(required=False)
    purchase_date = serializers.DateField(required=False, allow_null=True)
    reference_no = serializers.CharField(max_length=50, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    billing_address = serializers.CharField(required=False, allow_blank=True)
    shipping_address = serializers.CharField(required=False, allow_blank=True)
    payment_type_id = serializers.IntegerField(required=False, allow_null=True)
    due_date = OptionalDateField(required=False, allow_null=True)


class SaleDueSettingSerializer(BaseModelSerializer):
    class Meta:
        model = SaleDueSetting
        fields = (
            "id",
            "default_due_days_after_sale",
            "created_at",
            "updated_at",
        )


class SaleDueSettingWriteSerializer(serializers.ModelSerializer):
    apply_pending = serializers.BooleanField(required=False, default=True)

    class Meta:
        model = SaleDueSetting
        fields = ("default_due_days_after_sale", "apply_pending")

    def validate_default_due_days_after_sale(self, value):
        if value is None:
            raise serializers.ValidationError("Default due days after sale is required.")
        if value < 1:
            raise serializers.ValidationError("Default due days after sale must be at least 1 day.")
        return value
