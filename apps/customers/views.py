from rest_framework import status

from apps.customers.serializers import CustomerSerializer, CustomerWriteSerializer
from apps.customers.services import CustomerService
from core.base_response import ApiResponse
from core.base_viewset import BaseViewSet
from core.business_viewset import BusinessScopedViewSetMixin
from core.permissions import HasRole, IsAuthenticatedUser


class CustomerViewSet(BusinessScopedViewSetMixin, BaseViewSet):
    service_class = CustomerService
    serializer_class = CustomerSerializer
    write_serializer_class = CustomerWriteSerializer
    search_fields = ("name", "mobile", "email")
    required_roles = ["Business Owner"]

    def get_permissions(self):
        return [IsAuthenticatedUser(), HasRole()]

    def create(self, request):
        serializer = self.get_write_serializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        data = self.inject_business_scope(dict(serializer.validated_data))
        instance = self.get_service().create(data)
        payload = self.serializer_class(instance, context={"request": request}).data
        return ApiResponse.success(
            data=payload,
            message="Customer created",
            status_code=status.HTTP_201_CREATED,
        )
