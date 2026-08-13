from rest_framework import status

from apps.purchases.serializers import (
    PurchaseHeaderWriteSerializer,
    PurchaseSerializer,
    PurchaseWriteSerializer,
)
from apps.purchases.services import PurchaseService
from core.base_response import ApiResponse
from core.base_viewset import BaseViewSet
from core.business_viewset import BusinessScopedViewSetMixin
from core.permissions import HasRole, IsAuthenticatedUser


class PurchaseViewSet(BusinessScopedViewSetMixin, BaseViewSet):
    service_class = PurchaseService
    serializer_class = PurchaseSerializer
    write_serializer_class = PurchaseWriteSerializer
    search_fields = ("customer_name", "reference_no", "notes")
    filter_fields = ("customer_name", "reference_no")
    required_roles = ["Business Owner", "Business Staff"]
    required_tab = "purchases"
    ordering_default = ("-purchase_date", "-created_at")

    ordering_default = ("-purchase_date", "-created_at")
    ordering_fields = {
        "purchase_date": "purchase_date",
        "customer_name": "customer_name",
        "total_amount": "total_amount",
        "total_cost": "total_cost",
        "total_profit": "total_profit",
    }

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")
        if date_from:
            queryset = queryset.filter(purchase_date__gte=date_from)
        if date_to:
            queryset = queryset.filter(purchase_date__lte=date_to)
        return queryset

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
            message="Sale added successfully. Stock has been updated.",
            status_code=status.HTTP_201_CREATED,
        )

    def update(self, request, pk=None):
        return ApiResponse.error(
            message="Use PATCH to update sale details.",
            status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def partial_update(self, request, pk=None):
        serializer = PurchaseHeaderWriteSerializer(
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        instance = self.get_service().update_header(pk, serializer.validated_data)
        payload = self.serializer_class(instance, context={"request": request}).data
        return ApiResponse.success(
            data=payload,
            message="Sale updated successfully.",
        )

    def destroy(self, request, pk=None):
        return ApiResponse.error(
            message="Purchase delete is not supported.",
            status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        )
