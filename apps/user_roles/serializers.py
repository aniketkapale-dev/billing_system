from rest_framework import serializers

from apps.user_roles.models import UserRole
from core.base_serializer import BaseModelSerializer


class UserRoleSerializer(BaseModelSerializer):
    user_name = serializers.CharField(source="user.full_name", read_only=True)
    role_name = serializers.CharField(source="role.role_name", read_only=True)

    class Meta:
        model = UserRole
        fields = (
            "id", "user", "role", "user_name", "role_name",
            "is_active", "is_deleted", "created_at", "updated_at",
        )
