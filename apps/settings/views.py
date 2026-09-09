from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser

from apps.settings.serializers import (
    InvoiceSettingSerializer,
    InvoiceSettingWriteSerializer,
    ProductBarcodeBulkGenerateSerializer,
    ProductBarcodeSerializer,
    ProductBarcodeWriteSerializer,
    TaxSerializer,
    TaxWriteSerializer,
)
from apps.settings.services import InvoiceSettingService, ProductBarcodeService, TaxService
from core.base_response import ApiResponse
from core.base_viewset import BaseViewSet
from core.business_access import resolve_business_access, user_has_tab
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


class ProductBarcodeViewSet(BusinessScopedViewSetMixin, BaseViewSet):
    service_class = ProductBarcodeService
    serializer_class = ProductBarcodeSerializer
    write_serializer_class = ProductBarcodeWriteSerializer
    search_fields = ("value", "model_label", "product__name")
    ordering_default = ("model_label", "value")
    ordering_fields = {
        "value": "value",
        "model_label": "model_label",
        "product_name": "product__name",
    }
    required_roles = ["Business Owner", "Business Staff"]
    required_tab = "settings-barcode"
    stockin_tab = "stock-in"
    products_tab = "products"

    def get_permissions(self):
        return [IsAuthenticatedUser(), HasRole()]

    def get_active_business(self):
        if hasattr(self, "_active_business"):
            return self._active_business

        self._active_business, self._business_access = resolve_business_access(self.request)
        action = getattr(self, "action", None)
        path = (getattr(self.request, "path", "") or "").lower()
        allowed_tabs = [self.required_tab]
        if action in {"list", "retrieve", "create", "bulk_generate", "update", "partial_update"} or "bulk-generate" in path:
            allowed_tabs.extend([self.stockin_tab, self.products_tab])
        if not any(user_has_tab(self._business_access, tab) for tab in allowed_tabs):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You do not have access to this section.")
        return self._active_business

    def _apply_query(self, queryset):
        from django.db.models import Q

        product_id = (self.request.query_params.get("product_id") or "").strip()
        unassigned = (self.request.query_params.get("unassigned") or "").strip().lower()
        if unassigned in {"1", "true", "yes"}:
            queryset = queryset.filter(product_id__isnull=True)
        elif product_id.isdigit():
            queryset = queryset.filter(
                Q(product_id__isnull=True) | Q(product_id=int(product_id))
            )
        return super()._apply_query(queryset)

    def create(self, request):
        serializer = self.get_write_serializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        data = self.inject_business_scope(dict(serializer.validated_data))
        instance = self.get_service().create(data)
        payload = self.serializer_class(instance, context={"request": request}).data
        return ApiResponse.success(
            data=payload,
            message="Barcode saved",
            status_code=status.HTTP_201_CREATED,
        )

    def bulk_generate(self, request):
        serializer = ProductBarcodeBulkGenerateSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        data = self.inject_business_scope(dict(serializer.validated_data))
        instances = self.get_service().bulk_generate(data)
        payload = self.serializer_class(instances, many=True, context={"request": request}).data
        return ApiResponse.success(
            data={"items": payload, "count": len(payload)},
            message=f"{len(payload)} barcode(s) generated.",
            status_code=status.HTTP_201_CREATED,
        )
