from apps.products.serializers import ProductSerializer, ProductWriteSerializer
from apps.products.services import ProductService
from core.base_viewset import BaseViewSet
from core.business_viewset import BusinessScopedViewSetMixin
from core.base_response import ApiResponse
from core.permissions import HasRole, IsAuthenticatedUser
from rest_framework import status


class ProductViewSet(BusinessScopedViewSetMixin, BaseViewSet):
    service_class = ProductService
    serializer_class = ProductSerializer
    write_serializer_class = ProductWriteSerializer
    search_fields = ("name", "sku", "barcode", "description")
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
            message="Record created",
            status_code=status.HTTP_201_CREATED,
        )
