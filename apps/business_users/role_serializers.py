from rest_framework import serializers

from apps.business_users.constants import ALL_BUSINESS_TAB_CODES
from apps.roles.models import Role
from core.base_serializer import BaseModelSerializer


def clean_allowed_tabs(value):
    valid = set(ALL_BUSINESS_TAB_CODES)
    cleaned = []
    for code in value or []:
        code = (code or "").strip()
        if code and code in valid and code not in cleaned:
            cleaned.append(code)
    if not cleaned:
        raise serializers.ValidationError("Select at least one tab for this role.")
    return cleaned


class BusinessRoleSerializer(BaseModelSerializer):
    class Meta:
        model = Role
        fields = (
            "id",
            "role_name",
            "description",
            "allowed_tabs",
            "is_active",
            "created_at",
            "updated_at",
        )


class BusinessRoleWriteSerializer(serializers.Serializer):
    role_name = serializers.CharField(max_length=100)
    description = serializers.CharField(required=False, allow_blank=True)
    allowed_tabs = serializers.ListField(
        child=serializers.CharField(max_length=50),
        allow_empty=False,
    )

    def validate_role_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Role name is required.")
        return value

    def validate_allowed_tabs(self, value):
        return clean_allowed_tabs(value)
