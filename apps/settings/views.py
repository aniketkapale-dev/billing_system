from rest_framework import status

from apps.settings.serializers import (
    InvoiceSettingSerializer,
    InvoiceSettingWriteSerializer,
    TaxSerializer,
    TaxWriteSerializer,
)
from apps.settings.services import InvoiceSettingService, TaxService
from core.base_response import ApiResponse
from core.base_viewset import BaseViewSet
from core.business_viewset import BusinessScopedViewSetMixin
from core.permissions import HasRole, IsAuthenticatedUser


class TaxViewSet(BusinessScopedViewSetMixin, BaseViewSet):
    service_class = TaxService
    serializer_class = TaxSerializer
    write_serializer_class = TaxWriteSerializer
    search_fields = ("key",)
    ordering_default = ("key",)
    ordering_fields = {"key": "key", "value": "value"}
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
            message="Tax created",
            status_code=status.HTTP_201_CREATED,
        )


class InvoiceSettingViewSet(BusinessScopedViewSetMixin, BaseViewSet):
    service_class = InvoiceSettingService
    serializer_class = InvoiceSettingSerializer
    write_serializer_class = InvoiceSettingWriteSerializer
    search_fields = ("prefix", "suffix", "year")
    ordering_default = ("-year",)
    ordering_fields = {
        "year": "year",
        "prefix": "prefix",
        "suffix": "suffix",
        "counter": "counter",
        "current_counter": "current_counter",
        "end_counter": "end_counter",
    }
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
            message="Invoice settings saved",
            status_code=status.HTTP_201_CREATED,
        )
