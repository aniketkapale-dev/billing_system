from apps.roles.models import Role
from core.base_serializer import BaseModelSerializer


class RoleSerializer(BaseModelSerializer):
    class Meta:
        model = Role
        fields = (
            "id", "role_name", "description",
            "is_active", "is_deleted", "created_at", "updated_at",
        )
