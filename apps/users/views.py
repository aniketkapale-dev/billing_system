from apps.users.querysets import business_owner_users_queryset
from apps.users.serializers import UserDetailSerializer, UserSerializer, UserWriteSerializer
from apps.users.services import UserService
from core.base_response import ApiResponse
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
        scoped = business_owner_users_queryset()
        return queryset.filter(pk__in=scoped.values("pk"))

    def retrieve(self, request, pk=None):
        instance = self.get_service().get(pk, include_deleted=True)
        data = UserDetailSerializer(instance, context={"request": request}).data
        return ApiResponse.success(data=data, message="User details fetched")
