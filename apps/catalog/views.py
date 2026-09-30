from apps.catalog.serializers import (
    BrandSerializer,
    BrandWriteSerializer,
    CategorySerializer,
    CategoryWriteSerializer,
    ManufacturerSerializer,
    ManufacturerWriteSerializer,
    PaymentTypeSerializer,
    PaymentTypeWriteSerializer,
    UnitSerializer,
    UnitWriteSerializer,
    VendorSerializer,
    VendorWriteSerializer,
)
from apps.catalog.services import (
    BrandService,
    CategoryService,
    ManufacturerService,
    PaymentTypeService,
    UnitService,
    VendorService,
)
from core.base_response import ApiResponse
from core.base_viewset import BaseViewSet
from core.business_access import resolve_business_access, user_has_tab
from core.business_viewset import BusinessScopedViewSetMixin
from core.permissions import HasRole, IsAuthenticatedUser
from django.db.models import Q
from rest_framework import status
from rest_framework.exceptions import PermissionDenied


class UnitViewSet(BusinessScopedViewSetMixin, BaseViewSet):
    service_class = UnitService
    serializer_class = UnitSerializer
    write_serializer_class = UnitWriteSerializer
    search_fields = ("name", "short_name")
    ordering_default = ("name",)
    ordering_fields = {"name": "name", "short_name": "short_name"}
    required_roles = ["Business Owner", "Business Staff"]
    required_tab = "products-units"

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
            message="Unit created",
            status_code=status.HTTP_201_CREATED,
        )


class CategoryViewSet(BusinessScopedViewSetMixin, BaseViewSet):
    service_class = CategoryService
    serializer_class = CategorySerializer
    write_serializer_class = CategoryWriteSerializer
    search_fields = ("name", "description")
    ordering_default = ("name",)
    ordering_fields = {"name": "name", "description": "description"}
    required_roles = ["Business Owner", "Business Staff"]
    required_tab = "products-categories"
    settings_category_tax_tab = "settings-category-tax"

    def get_permissions(self):
        return [IsAuthenticatedUser(), HasRole()]

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)
        request = self.request

        assignment = (request.query_params.get("tax_assignment") or "").strip().lower()
        if assignment == "with":
            queryset = queryset.exclude(sale_tax_ids=[]).exclude(sale_tax_ids__isnull=True)
        elif assignment == "without":
            queryset = queryset.filter(Q(sale_tax_ids=[]) | Q(sale_tax_ids__isnull=True))

        sale_tax_id = request.query_params.get("sale_tax_id")
        if sale_tax_id:
            try:
                tax_id = int(sale_tax_id)
            except (TypeError, ValueError):
                tax_id = None
            if tax_id is not None:
                queryset = queryset.filter(sale_tax_ids__contains=[tax_id])

        return queryset

    def get_active_business(self):
        if hasattr(self, "_active_business"):
            return self._active_business

        self._active_business, self._business_access = resolve_business_access(self.request)
        action = getattr(self, "action", None)
        allowed_tabs = [self.required_tab]
        if action in {"list", "retrieve", "update", "partial_update", "create"}:
            allowed_tabs.append(self.settings_category_tax_tab)
        if not any(user_has_tab(self._business_access, tab) for tab in allowed_tabs):
            raise PermissionDenied("You do not have access to this section.")
        return self._active_business

    def create(self, request):
        serializer = self.get_write_serializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        data = self.inject_business_scope(dict(serializer.validated_data))
        instance = self.get_service().create(data)
        payload = self.serializer_class(instance, context={"request": request}).data
        return ApiResponse.success(
            data=payload,
            message="Category created",
            status_code=status.HTTP_201_CREATED,
        )


class BrandViewSet(BusinessScopedViewSetMixin, BaseViewSet):
    service_class = BrandService
    serializer_class = BrandSerializer
    write_serializer_class = BrandWriteSerializer
    search_fields = ("name",)
    ordering_default = ("name",)
    ordering_fields = {"name": "name"}
    required_roles = ["Business Owner", "Business Staff"]
    required_tab = "products-brands"

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
            message="Brand created",
            status_code=status.HTTP_201_CREATED,
        )


class ManufacturerViewSet(BusinessScopedViewSetMixin, BaseViewSet):
    service_class = ManufacturerService
    serializer_class = ManufacturerSerializer
    write_serializer_class = ManufacturerWriteSerializer
    search_fields = ("name",)
    required_roles = ["Business Owner", "Business Staff"]
    required_tab = "products"

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
            message="Manufacturer created",
            status_code=status.HTTP_201_CREATED,
        )


class PaymentTypeViewSet(BusinessScopedViewSetMixin, BaseViewSet):
    service_class = PaymentTypeService
    serializer_class = PaymentTypeSerializer
    write_serializer_class = PaymentTypeWriteSerializer
    search_fields = ("name",)
    required_roles = ["Business Owner", "Business Staff"]
    required_tab = "purchases"

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
            message="Payment type created",
            status_code=status.HTTP_201_CREATED,
        )


class VendorViewSet(BusinessScopedViewSetMixin, BaseViewSet):
    service_class = VendorService
    serializer_class = VendorSerializer
    write_serializer_class = VendorWriteSerializer
    search_fields = ("name",)
    ordering_default = ("name",)
    ordering_fields = {"name": "name"}
    required_roles = ["Business Owner", "Business Staff"]
    required_tab = "stock-in"

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
            message="Vendor created",
            status_code=status.HTTP_201_CREATED,
        )
