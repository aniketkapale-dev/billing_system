from apps.businesses.serializers import BusinessSerializer, BusinessWriteSerializer
from apps.businesses.services import BusinessService
from core.base_viewset import BaseViewSet
from core.permissions import HasRole, IsAuthenticatedUser


class BusinessViewSet(BaseViewSet):
    service_class = BusinessService
    serializer_class = BusinessSerializer
    write_serializer_class = BusinessWriteSerializer
    search_fields = ("name",)
    required_roles = ["Business Owner"]

    def get_permissions(self):
        return [IsAuthenticatedUser(), HasRole()]

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)
        user = self.request.user
        if user:
            return queryset.filter(owner_id=user.id)
        return queryset.none()
