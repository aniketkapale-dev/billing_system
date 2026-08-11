from rest_framework import serializers

from apps.customers.models import Customer
from core.base_serializer import BaseModelSerializer


class CustomerSerializer(BaseModelSerializer):
    business_name = serializers.CharField(source="business.business_name", read_only=True)

    class Meta:
        model = Customer
        fields = (
            "id",
            "business",
            "business_name",
            "name",
            "mobile",
            "email",
            "gst_number",
            "address",
            "is_active",
            "is_deleted",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("business",)


class CustomerWriteSerializer(serializers.ModelSerializer):
    mobile = serializers.CharField(max_length=20)

    class Meta:
        model = Customer
        fields = ("name", "mobile", "email", "gst_number", "address", "is_active")

    def validate_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Customer name is required.")
        return value

    def validate_mobile(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Mobile number is required.")
        from core.validators import validate_mobile_number

        return validate_mobile_number(value)

    def validate_email(self, value):
        if value:
            return value.strip().lower()
        return ""

    def validate_gst_number(self, value):
        return (value or "").strip()

    def validate_address(self, value):
        return (value or "").strip()
