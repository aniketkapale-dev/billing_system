from apps.user_roles.serializers import UserRoleSerializer
from apps.user_roles.services import UserRoleService
from core.base_viewset import BaseViewSet


class UserRoleViewSet(BaseViewSet):
    service_class = UserRoleService
    serializer_class = UserRoleSerializer
    search_fields = ("user__full_name", "role__role_name")
