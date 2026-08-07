from rest_framework import status

from apps.invoicing.serializers import (
    InventoryBatchSerializer,
    PurchaseInvoiceSerializer,
    PurchaseInvoiceWriteSerializer,
)
from apps.invoicing.services import PurchaseInvoiceService
from apps.invoicing.repositories import InventoryBatchRepository
from core.base_response import ApiResponse
from core.base_viewset import BaseViewSet
from core.business_viewset import BusinessScopedViewSetMixin
from core.permissions import HasRole, IsAuthenticatedUser


class PurchaseInvoiceViewSet(BusinessScopedViewSetMixin, BaseViewSet):
    service_class = PurchaseInvoiceService
    serializer_class = PurchaseInvoiceSerializer
    write_serializer_class = PurchaseInvoiceWriteSerializer
    search_fields = ("invoice_number", "remarks")
    filter_fields = ("invoice_number",)
    required_roles = ["Business Owner"]
    ordering_default = ("-invoice_date", "-created_at")

    def get_permissions(self):
        return [IsAuthenticatedUser(), HasRole()]

    def create(self, request):
        serializer = self.get_write_serializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        data = self.inject_business_scope(dict(serializer.validated_data))
        instance = self.get_service().create_with_items(data)
        payload = self.serializer_class(instance, context={"request": request}).data
        return ApiResponse.success(
            data=payload,
            message="Purchase invoice recorded and inventory batches created.",
            status_code=status.HTTP_201_CREATED,
        )

    def update(self, request, pk=None):
        return ApiResponse.error(
            message="Purchase invoice updates are not supported.",
            status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def partial_update(self, request, pk=None):
        return self.update(request, pk=pk)

    def destroy(self, request, pk=None):
        return ApiResponse.error(
            message="Purchase invoice delete is not supported.",
            status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        )


class InventoryBatchViewSet(BusinessScopedViewSetMixin, BaseViewSet):
    service_class = None
    serializer_class = InventoryBatchSerializer
    search_fields = ("product__name", "product__sku", "batch_number")
    filter_fields = ("product", "batch_number")
    required_roles = ["Business Owner"]
    ordering_default = ("created_at",)
    ordering_fields = {
        "created_at": "created_at",
        "expiry_date": "expiry_date",
        "available_quantity": "available_quantity",
        "product_name": "product__name",
    }

    def get_permissions(self):
        return [IsAuthenticatedUser(), HasRole()]

    def get_service(self):
        from core.base_service import BaseService

        class _BatchListService(BaseService):
            repository = InventoryBatchRepository()

        return _BatchListService()

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)
        in_stock = self.request.query_params.get("in_stock")
        if in_stock == "true":
            queryset = queryset.filter(available_quantity__gt=0)
        product_id = self.request.query_params.get("product_id")
        if product_id:
            queryset = queryset.filter(product_id=product_id)
        return queryset
