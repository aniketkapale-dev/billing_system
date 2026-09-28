from rest_framework import serializers

from apps.catalog.models import Brand, Category, Manufacturer, PaymentType, Unit, Vendor
from core.base_serializer import BaseModelSerializer


class UnitSerializer(BaseModelSerializer):
    business_name = serializers.CharField(source="business.business_name", read_only=True)

    class Meta:
        model = Unit
        fields = (
            "id",
            "business",
            "business_name",
            "name",
            "short_name",
            "is_active",
            "is_deleted",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("business",)


class UnitWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Unit
        fields = ("name", "short_name", "is_active")


class CategorySerializer(BaseModelSerializer):
    business_name = serializers.CharField(source="business.business_name", read_only=True)
    sale_tax_labels = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = (
            "id",
            "business",
            "business_name",
            "name",
            "description",
            "sale_tax_ids",
            "sale_tax_labels",
            "is_active",
            "is_deleted",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("business",)

    def get_sale_tax_labels(self, obj):
        tax_ids = obj.sale_tax_ids or []
        if not tax_ids:
            return []
        from apps.settings.models import Tax

        taxes = Tax.objects.filter(pk__in=tax_ids, is_deleted=False)
        order = {pk: idx for idx, pk in enumerate(tax_ids)}
        taxes = sorted(taxes, key=lambda item: order.get(item.pk, 0))
        return [
            {"id": tax.id, "key": tax.key, "value": str(tax.value)}
            for tax in taxes
        ]


class CategoryWriteSerializer(serializers.ModelSerializer):
    sale_tax_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=True,
    )

    class Meta:
        model = Category
        fields = ("name", "description", "sale_tax_ids", "is_active")


class BrandSerializer(BaseModelSerializer):
    business_name = serializers.CharField(source="business.business_name", read_only=True)

    class Meta:
        model = Brand
        fields = (
            "id",
            "business",
            "business_name",
            "name",
            "is_active",
            "is_deleted",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("business",)


class BrandWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Brand
        fields = ("name", "is_active")


class ManufacturerSerializer(BaseModelSerializer):
    business_name = serializers.CharField(source="business.business_name", read_only=True)

    class Meta:
        model = Manufacturer
        fields = (
            "id",
            "business",
            "business_name",
            "name",
            "is_active",
            "is_deleted",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("business",)


class ManufacturerWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Manufacturer
        fields = ("name", "is_active")


class PaymentTypeSerializer(BaseModelSerializer):
    business_name = serializers.CharField(source="business.business_name", read_only=True)

    class Meta:
        model = PaymentType
        fields = (
            "id",
            "business",
            "business_name",
            "name",
            "is_active",
            "is_deleted",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("business",)


class PaymentTypeWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentType
        fields = ("name", "is_active")


class VendorSerializer(BaseModelSerializer):
    business_name = serializers.CharField(source="business.business_name", read_only=True)

    class Meta:
        model = Vendor
        fields = (
            "id",
            "business",
            "business_name",
            "name",
            "address",
            "pin_code",
            "gst_number",
            "is_active",
            "is_deleted",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("business",)


class VendorWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vendor
        fields = ("name", "address", "pin_code", "gst_number", "is_active")

    def validate_address(self, value):
        return (value or "").strip()

    def validate_pin_code(self, value):
        value = (value or "").strip()
        if not value:
            return ""
        if not value.isdigit() or len(value) != 6:
            raise serializers.ValidationError("Enter a valid 6-digit pin code.")
        return value

    def validate_gst_number(self, value):
        return (value or "").strip()
