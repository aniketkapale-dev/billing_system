from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.views import APIView

from core.pagination import StandardPagination

from apps.settings.serializers import (
    InvoiceSettingSerializer,
    InvoiceSettingWriteSerializer,
    ProductBarcodeBulkGenerateSerializer,
    ProductBarcodeSerializer,
    ProductBarcodeWriteSerializer,
    TaxSerializer,
    TaxWriteSerializer,
    WhatsAppMessageLogSerializer,
    WhatsAppMessageSettingSerializer,
    WhatsAppMessageSettingWriteSerializer,
)
from apps.settings.services import (
    InvoiceSettingService,
    ProductBarcodeService,
    TaxService,
    WhatsAppMessageSettingService,
)
from core.base_response import ApiResponse
from core.base_viewset import BaseViewSet
from core.business_access import resolve_business_access, user_has_tab
from core.business_viewset import BusinessScopedViewSetMixin
from core.pagination import BarcodePagination
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
    read_access_tabs = ("purchases", "stock-in")

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
    read_access_tabs = ("purchases", "stock-in")

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
    pagination_class = BarcodePagination
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

        from apps.products.models import Product

        product_id = (self.request.query_params.get("product_id") or "").strip()
        sku = (self.request.query_params.get("sku") or "").strip()
        unassigned = (self.request.query_params.get("unassigned") or "").strip().lower()

        if unassigned in {"1", "true", "yes"}:
            queryset = queryset.filter(product_id__isnull=True)
        elif sku:
            queryset = queryset.filter(
                Q(product__sku__iexact=sku)
                | Q(product__isnull=True, model_label__iexact=sku)
            )
        elif product_id.isdigit():
            pid = int(product_id)
            product = Product.objects.filter(pk=pid, is_deleted=False).first()
            if product and (product.sku or "").strip():
                sku_value = product.sku.strip()
                queryset = queryset.filter(
                    Q(product_id=pid)
                    | Q(product__isnull=True, model_label__iexact=sku_value)
                )
            else:
                queryset = queryset.filter(product_id=pid)

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


class WhatsAppMessageSettingView(APIView):
    required_roles = ["Business Owner", "Business Staff"]
    required_tab = "settings-whatsapp"
    permission_classes = [IsAuthenticatedUser, HasRole]

    def _get_business(self, request):
        from core.business_access import resolve_business_access, user_has_tab

        business, access = resolve_business_access(request)
        if not user_has_tab(access, self.required_tab):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You do not have access to this section.")
        return business

    def get(self, request):
        business = self._get_business(request)
        instance = WhatsAppMessageSettingService().get_or_create_for_business(business.id)
        payload = WhatsAppMessageSettingSerializer(instance, context={"request": request}).data
        return ApiResponse.success(data=payload, message="WhatsApp message settings")

    def patch(self, request):
        business = self._get_business(request)
        service = WhatsAppMessageSettingService()
        instance = service.get_or_create_for_business(business.id)
        serializer = WhatsAppMessageSettingWriteSerializer(
            instance,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        updated = service.update(instance.pk, dict(serializer.validated_data))
        payload = WhatsAppMessageSettingSerializer(updated, context={"request": request}).data
        return ApiResponse.success(data=payload, message="WhatsApp message settings saved")


class WhatsAppMessageSendView(APIView):
    required_roles = ["Business Owner", "Business Staff"]
    required_tab = "settings-whatsapp"
    permission_classes = [IsAuthenticatedUser, HasRole]

    def post(self, request):
        from core.business_access import resolve_business_access, user_has_tab

        business, access = resolve_business_access(request)
        if not user_has_tab(access, self.required_tab):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You do not have access to this section.")

        data = WhatsAppMessageSettingService().send_pending_payment_messages(business.id)
        count = data.get("count", 0)
        pending_count = data.get("pending_count", 0)
        first_time_count = data.get("first_time_count", 0)

        if not pending_count:
            message = "No pending invoices found."
        elif not count:
            message = "No invoices are due for reminders based on your day settings."
        elif first_time_count == count:
            message = f"WhatsApp reminders sent for {count} invoice(s) (all first time)."
        elif first_time_count:
            message = (
                f"WhatsApp reminders sent for {count} invoice(s) "
                f"({first_time_count} first time)."
            )
        else:
            message = f"WhatsApp reminders sent for {count} invoice(s)."
        return ApiResponse.success(data=data, message=message)


class WhatsAppMessageLogListView(APIView):
    required_roles = ["Business Owner", "Business Staff"]
    required_tab = "settings-whatsapp"
    permission_classes = [IsAuthenticatedUser, HasRole]
    pagination_class = StandardPagination

    def _get_business(self, request):
        from core.business_access import resolve_business_access, user_has_tab

        business, access = resolve_business_access(request)
        if not user_has_tab(access, self.required_tab):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You do not have access to this section.")
        return business

    def get(self, request):
        business = self._get_business(request)
        queryset = WhatsAppMessageSettingService().list_sent_messages(business.id)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        payload = WhatsAppMessageLogSerializer(page, many=True, context={"request": request}).data
        return paginator.get_paginated_response(payload)
