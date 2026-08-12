from apps.inventory.serializers import InventoryStockSerializer
from apps.inventory.services import InventoryStockService
from core.base_response import ApiResponse
from core.base_viewset import BaseViewSet
from core.business_viewset import BusinessScopedViewSetMixin
from core.permissions import HasRole, IsAuthenticatedUser


class InventoryStockViewSet(BusinessScopedViewSetMixin, BaseViewSet):
    service_class = InventoryStockService
    serializer_class = InventoryStockSerializer
    search_fields = ("product__name", "product__sku")
    required_roles = ["Business Owner"]
    ordering_default = ("product__name",)
    ordering_fields = {
        "product__name": "product__name",
        "product__sku": "product__sku",
        "product__unit__short_name": "product__unit__short_name",
        "quantity": "quantity",
    }

    def get_permissions(self):
        return [IsAuthenticatedUser(), HasRole()]

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)
        in_stock = self.request.query_params.get("in_stock")
        if in_stock != "false":
            queryset = queryset.filter(quantity__gt=0)
        return queryset

    def profit_summary(self, request):
        business = self.get_active_business()
        data = self.get_service().get_profit_summary(business.id)
        return ApiResponse.success(data=data, message="Profit summary fetched")
