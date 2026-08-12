import json

from rest_framework import status

from apps.invoicing.models import InventoryBatch, PurchaseInvoice, PurchaseInvoiceItem
from apps.invoicing.serializers import (
    InventoryBatchSerializer,
    PurchaseInvoiceHeaderWriteSerializer,
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
    ordering_fields = {
        "invoice_date": "invoice_date",
        "invoice_number": "invoice_number",
        "subtotal": "subtotal",
        "grand_total": "grand_total",
    }

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")
        if date_from:
            queryset = queryset.filter(invoice_date__gte=date_from)
        if date_to:
            queryset = queryset.filter(invoice_date__lte=date_to)
        return queryset

    def _merge_request_data(self, request):
        data = {}
        if hasattr(request.data, "keys"):
            for key in request.data.keys():
                data[key] = request.data.get(key)
        for key in request.FILES.keys():
            data[key] = request.FILES.get(key)
        items = data.get("items")
        if isinstance(items, str):
            try:
                data["items"] = json.loads(items)
            except (TypeError, ValueError):
                pass
        return data

    def get_permissions(self):
        return [IsAuthenticatedUser(), HasRole()]

    def create(self, request):
        data = self._merge_request_data(request)
        serializer = self.get_write_serializer(
            data=data,
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
            message="Use PATCH to update purchase invoice details.",
            status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def partial_update(self, request, pk=None):
        data = self._merge_request_data(request)
        serializer = PurchaseInvoiceHeaderWriteSerializer(
            data=data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        instance = self.get_service().update_header(pk, serializer.validated_data)
        payload = self.serializer_class(instance, context={"request": request}).data
        return ApiResponse.success(
            data=payload,
            message="Purchase invoice updated.",
        )

    def destroy(self, request, pk=None):
        self.get_service().soft_delete(pk)
        return ApiResponse.success(message="Purchase invoice deleted.")


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
        "batch_number": "batch_number",
        "purchase_price": "purchase_price",
        "selling_price": "selling_price",
        "invoice_number": "purchase_invoice_item__purchase_invoice__invoice_number",
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
