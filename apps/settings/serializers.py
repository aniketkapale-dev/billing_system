from rest_framework import serializers

from apps.settings.models import InvoiceSetting, Tax
from core.base_serializer import BaseModelSerializer


class TaxSerializer(BaseModelSerializer):
    business_name = serializers.CharField(source="business.business_name", read_only=True)

    class Meta:
        model = Tax
        fields = (
            "id",
            "business",
            "business_name",
            "key",
            "value",
            "is_active",
            "is_deleted",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("business",)


class TaxWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tax
        fields = ("key", "value", "is_active")

    def validate_value(self, value):
        if value is None:
            raise serializers.ValidationError("Tax value is required.")
        if value < 0 or value > 100:
            raise serializers.ValidationError("Tax value must be between 0 and 100.")
        return value


class InvoiceSettingSerializer(BaseModelSerializer):
    business_name = serializers.CharField(source="business.business_name", read_only=True)

    class Meta:
        model = InvoiceSetting
        fields = (
            "id",
            "business",
            "business_name",
            "year",
            "prefix",
            "suffix",
            "counter",
            "current_counter",
            "end_counter",
            "is_active",
            "is_deleted",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("business",)


class InvoiceSettingWriteSerializer(serializers.ModelSerializer):
    counter = serializers.IntegerField(required=False, min_value=0, default=1)

    class Meta:
        model = InvoiceSetting
        fields = ("year", "prefix", "suffix", "counter", "end_counter", "is_active")

    def validate_year(self, value):
        if value < 2000 or value > 2100:
            raise serializers.ValidationError("Year must be between 2000 and 2100.")
        return value

    def validate_counter(self, value):
        if value is None:
            return 0
        if value < 0:
            raise serializers.ValidationError("Start counter cannot be negative.")
        return value
