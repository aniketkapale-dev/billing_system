from rest_framework import serializers

from apps.business_users.models import BusinessUser
from core.base_serializer import BaseModelSerializer


class BusinessUserSerializer(BaseModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    full_name = serializers.CharField(source="user.full_name", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    mobile_number = serializers.CharField(source="user.mobile_number", read_only=True)
    role_id = serializers.IntegerField(source="role.id", read_only=True, allow_null=True)
    role_name = serializers.CharField(source="role.role_name", read_only=True, allow_null=True, default="")

    class Meta:
        model = BusinessUser
        fields = (
            "id",
            "business",
            "user_id",
            "full_name",
            "email",
            "mobile_number",
            "role_id",
            "role_name",
            "allowed_tabs",
            "is_active",
            "created_at",
            "updated_at",
        )


class BusinessUserWriteSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150)
    email = serializers.EmailField(required=False, allow_blank=True, allow_null=True)
    mobile_number = serializers.CharField(max_length=20)
    password = serializers.CharField(min_length=6, write_only=True)
    role_id = serializers.IntegerField()
    is_active = serializers.BooleanField(required=False, default=True)


class BusinessUserUpdateSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150, required=False)
    email = serializers.EmailField(required=False, allow_blank=True, allow_null=True)
    mobile_number = serializers.CharField(max_length=20, required=False)
    password = serializers.CharField(min_length=6, required=False, allow_blank=True, write_only=True)
    role_id = serializers.IntegerField(required=False)
    is_active = serializers.BooleanField(required=False)
