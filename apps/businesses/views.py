from django.db.models import Q

from apps.businesses.serializers import BusinessSerializer, BusinessWriteSerializer
from apps.businesses.services import BusinessService
from core.base_viewset import BaseViewSet
from core.permissions import HasRole, IsAuthenticatedUser
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser


class BusinessViewSet(BaseViewSet):
    service_class = BusinessService
    serializer_class = BusinessSerializer
    write_serializer_class = BusinessWriteSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    search_fields = ("business_name", "gst_number", "phone", "email", "address")
    required_roles = ["Business Owner", "Business Staff"]

    def get_permissions(self):
        if getattr(self, "action", None) in ["create", "update", "partial_update", "destroy"]:
            self.required_roles = ["Business Owner"]
        else:
            self.required_roles = ["Business Owner", "Business Staff"]
        return [IsAuthenticatedUser(), HasRole()]

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)
        user = self.request.user
        if user:
            from apps.business_users.models import BusinessUser

            member_ids = BusinessUser.objects.filter(
                user_id=user.id,
                is_deleted=False,
                is_active=True,
            ).values_list("business_id", flat=True)
            return queryset.filter(
                Q(owner_id=user.id) | Q(id__in=member_ids)
            ).distinct()
        return queryset.none()

    def _get_owned_instance(self, pk):
        from core.exceptions import NotFoundException

        instance = self.get_service().get(pk, include_deleted=True)
        if self.request.user and instance.owner_id != self.request.user.id:
            raise NotFoundException("Business not found.")
        return instance

    def retrieve(self, request, pk=None):
        from core.base_response import ApiResponse

        instance = self._get_owned_instance(pk)
        data = self.serializer_class(instance, context={"request": request}).data
        return ApiResponse.success(data=data, message="Record fetched")

    def update(self, request, pk=None):
        self._get_owned_instance(pk)
        return super().update(request, pk)

    def partial_update(self, request, pk=None):
        self._get_owned_instance(pk)
        return super().partial_update(request, pk)

    def destroy(self, request, pk=None):
        self._get_owned_instance(pk)
        return super().destroy(request, pk)
