from apps.roles.serializers import RoleSerializer
from apps.roles.services import RoleService
from core.base_viewset import BaseViewSet


class RoleViewSet(BaseViewSet):
    service_class = RoleService
    serializer_class = RoleSerializer
    search_fields = ("role_name", "description")
