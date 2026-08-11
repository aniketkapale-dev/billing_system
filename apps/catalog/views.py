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
)
from apps.catalog.services import (
    BrandService,
    CategoryService,
    ManufacturerService,
    PaymentTypeService,
    UnitService,
)
from core.base_response import ApiResponse
from core.base_viewset import BaseViewSet
from core.business_viewset import BusinessScopedViewSetMixin
from core.permissions import HasRole, IsAuthenticatedUser
from rest_framework import status


class UnitViewSet(BusinessScopedViewSetMixin, BaseViewSet):
    service_class = UnitService
    serializer_class = UnitSerializer
    write_serializer_class = UnitWriteSerializer
    search_fields = ("name", "short_name")
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
            message="Unit created",
            status_code=status.HTTP_201_CREATED,
        )


class CategoryViewSet(BusinessScopedViewSetMixin, BaseViewSet):
    service_class = CategoryService
    serializer_class = CategorySerializer
    write_serializer_class = CategoryWriteSerializer
    search_fields = ("name", "description")
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
            message="Category created",
            status_code=status.HTTP_201_CREATED,
        )


class BrandViewSet(BusinessScopedViewSetMixin, BaseViewSet):
    service_class = BrandService
    serializer_class = BrandSerializer
    write_serializer_class = BrandWriteSerializer
    search_fields = ("name",)
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
            message="Brand created",
            status_code=status.HTTP_201_CREATED,
        )


class ManufacturerViewSet(BusinessScopedViewSetMixin, BaseViewSet):
    service_class = ManufacturerService
    serializer_class = ManufacturerSerializer
    write_serializer_class = ManufacturerWriteSerializer
    search_fields = ("name",)
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
            message="Manufacturer created",
            status_code=status.HTTP_201_CREATED,
        )


class PaymentTypeViewSet(BusinessScopedViewSetMixin, BaseViewSet):
    service_class = PaymentTypeService
    serializer_class = PaymentTypeSerializer
    write_serializer_class = PaymentTypeWriteSerializer
    search_fields = ("name",)
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
            message="Payment type created",
            status_code=status.HTTP_201_CREATED,
        )
