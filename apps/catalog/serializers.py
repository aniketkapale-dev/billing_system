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

    class Meta:
        model = Category
        fields = (
            "id",
            "business",
            "business_name",
            "name",
            "description",
            "is_active",
            "is_deleted",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("business",)


class CategoryWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ("name", "description", "is_active")


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
            "is_active",
            "is_deleted",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("business",)


class VendorWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vendor
        fields = ("name", "is_active")
