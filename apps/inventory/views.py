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

    def get_permissions(self):
        return [IsAuthenticatedUser(), HasRole()]

    def profit_summary(self, request):
        business = self.get_active_business()
        data = self.get_service().get_profit_summary(business.id)
        return ApiResponse.success(data=data, message="Profit summary fetched")
