from django.db.models import Q

from apps.users.serializers import UserSerializer, UserWriteSerializer
from apps.users.services import UserService
from core.base_viewset import BaseViewSet
from core.permissions import HasRole, IsAuthenticatedUser


class UserViewSet(BaseViewSet):
    service_class = UserService
    serializer_class = UserSerializer
    write_serializer_class = UserWriteSerializer
    search_fields = ("full_name", "email", "mobile_number")
    required_roles = ["Super Admin"]

    def get_permissions(self):
        return [IsAuthenticatedUser(), HasRole()]

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)
        return queryset.exclude(
            Q(user_roles__role__role_name="Super Admin") & Q(user_roles__is_deleted=False)
        ).distinct()
