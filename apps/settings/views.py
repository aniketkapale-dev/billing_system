from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser

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
    required_roles = ["Business Owner", "Business Staff"]
    required_tab = "settings-tax"

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
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    service_class = InvoiceSettingService
    serializer_class = InvoiceSettingSerializer
    write_serializer_class = InvoiceSettingWriteSerializer
    search_fields = ("prefix", "suffix")
    ordering_default = ("-year",)
    ordering_fields = {
        "year": "year",
        "prefix": "prefix",
        "suffix": "suffix",
        "counter": "counter",
        "current_counter": "current_counter",
        "end_counter": "end_counter",
    }
    required_roles = ["Business Owner", "Business Staff"]
    required_tab = "settings-invoice"

    def get_permissions(self):
        return [IsAuthenticatedUser(), HasRole()]

    def _apply_query(self, queryset):
        from django.db.models import Q

        search = (self.request.query_params.get("search") or "").strip()
        if search:
            q = Q(prefix__icontains=search) | Q(suffix__icontains=search)
            if search.isdigit():
                q |= Q(year=int(search))
            queryset = queryset.filter(q)

        saved_fields = self.search_fields
        self.search_fields = ()
        try:
            return super()._apply_query(queryset)
        finally:
            self.search_fields = saved_fields

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
