from rest_framework import serializers

from apps.businesses.models import Business
from core.base_serializer import BaseModelSerializer


class BusinessSerializer(BaseModelSerializer):
    owner_name = serializers.CharField(source="owner.full_name", read_only=True)
    logo_url = serializers.SerializerMethodField()
    is_owner = serializers.SerializerMethodField()

    class Meta:
        model = Business
        fields = (
            "id",
            "owner",
            "owner_name",
            "is_owner",
            "business_name",
            "gst_number",
            "phone",
            "email",
            "address",
            "logo",
            "logo_url",
            "is_active",
            "is_deleted",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("owner", "logo")

    def get_logo_url(self, obj):
        if not obj.logo:
            return None
        request = self.context.get("request")
        url = obj.logo.url
        if request:
            return request.build_absolute_uri(url)
        return url

    def get_is_owner(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user:
            return False
        return obj.owner_id == user.id


class BusinessWriteSerializer(serializers.ModelSerializer):
    clear_logo = serializers.BooleanField(required=False, write_only=True, default=False)

    class Meta:
        model = Business
        fields = (
            "business_name",
            "gst_number",
            "phone",
            "email",
            "address",
            "logo",
            "clear_logo",
            "is_active",
        )

    def validate_business_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Business name is required.")
        return value

    def validate_email(self, value):
        if value:
            return value.strip().lower()
        return ""

    def validate_gst_number(self, value):
        return (value or "").strip()

    def validate_phone(self, value):
        value = (value or "").strip()
        if not value:
            return ""
        from core.validators import validate_mobile_number

        return validate_mobile_number(value)

    def validate_address(self, value):
        return (value or "").strip()
