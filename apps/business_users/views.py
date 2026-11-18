from django.core.paginator import EmptyPage, Paginator
from django.db.models import Q
from rest_framework import status

from apps.business_users.role_serializers import BusinessRoleSerializer, BusinessRoleWriteSerializer
from apps.business_users.serializers import (
    BusinessUserSerializer,
    BusinessUserUpdateSerializer,
    BusinessUserWriteSerializer,
)
from apps.business_users.services import BusinessUserService
from core.base_response import ApiResponse
from core.business_scope import parse_business_id
from core.exceptions import ValidationException
from core.permissions import HasRole, IsAuthenticatedUser
from rest_framework.viewsets import GenericViewSet


class BusinessUserViewSet(GenericViewSet):
    service_class = BusinessUserService
    serializer_class = BusinessUserSerializer
    required_roles = ["Business Owner"]

    def get_permissions(self):
        return [IsAuthenticatedUser(), HasRole()]

    def get_service(self):
        return self.service_class()

    def _business_id(self):
        return parse_business_id(self.request)

    def list(self, request):
        business_id = self._business_id()
        queryset = self.get_service().list_for_business(business_id)

        search = (request.query_params.get("search") or "").strip()
        if search:
            queryset = queryset.filter(
                Q(user__full_name__icontains=search)
                | Q(user__email__icontains=search)
                | Q(user__mobile_number__icontains=search)
                | Q(role__role_name__icontains=search)
            )

        ordering = (request.query_params.get("ordering") or "user__full_name").strip()
        ordering_map = {
            "full_name": "user__full_name",
            "email": "user__email",
            "role": "role__role_name",
        }
        desc = ordering.startswith("-")
        order_name = ordering[1:] if desc else ordering
        mapped = ordering_map.get(order_name, "user__full_name")
        queryset = queryset.order_by(("-" if desc else "") + mapped, "id")

        try:
            page = int(request.query_params.get("page") or 1)
        except (TypeError, ValueError):
            page = 1
        try:
            page_size = int(request.query_params.get("page_size") or 10)
        except (TypeError, ValueError):
            page_size = 10
        if page < 1:
            page = 1
        if page_size < 1:
            page_size = 10
        if page_size > 50:
            page_size = 50

        paginator = Paginator(queryset, page_size)
        try:
            page_obj = paginator.page(page)
        except EmptyPage:
            page_obj = paginator.page(paginator.num_pages or 1)

        payload = self.serializer_class(
            page_obj.object_list,
            many=True,
            context={"request": request},
        ).data
        return ApiResponse.success(
            data={
                "items": payload,
                "pagination": {
                    "count": paginator.count,
                    "page": page_obj.number,
                    "page_size": page_size,
                    "total_pages": paginator.num_pages,
                    "has_next": page_obj.has_next(),
                    "has_previous": page_obj.has_previous(),
                },
            },
            message="Business users fetched",
        )

    def create(self, request):
        serializer = BusinessUserWriteSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        business_id = self._business_id()
        instance = self.get_service().create_member(business_id, serializer.validated_data)
        payload = self.serializer_class(instance, context={"request": request}).data
        return ApiResponse.success(
            data=payload,
            message="Business user created",
            status_code=status.HTTP_201_CREATED,
        )

    def partial_update(self, request, pk=None):
        serializer = BusinessUserUpdateSerializer(
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        business_id = self._business_id()
        instance = self.get_service().update_member(pk, business_id, serializer.validated_data)
        payload = self.serializer_class(instance, context={"request": request}).data
        return ApiResponse.success(data=payload, message="Business user updated")

    def destroy(self, request, pk=None):
        business_id = self._business_id()
        self.get_service().delete_member(pk, business_id)
        return ApiResponse.success(message="Business user removed")


class BusinessUserMetaViewSet(GenericViewSet):
    service_class = BusinessUserService
    required_roles = ["Business Owner", "Business Staff"]

    def get_permissions(self):
        return [IsAuthenticatedUser(), HasRole()]

    def get_service(self):
        return self.service_class()

    def tabs(self, request):
        return ApiResponse.success(
            data={"items": self.get_service().list_tab_definitions()},
            message="Tab options fetched",
        )

    def my_access(self, request):
        try:
            access = self.get_service().get_my_access(request)
        except ValidationException as exc:
            return ApiResponse.error(message=str(exc), status_code=status.HTTP_400_BAD_REQUEST)
        return ApiResponse.success(data=access, message="Access fetched")


class BusinessRoleViewSet(GenericViewSet):
    service_class = BusinessUserService
    serializer_class = BusinessRoleSerializer
    required_roles = ["Business Owner"]

    def get_permissions(self):
        return [IsAuthenticatedUser(), HasRole()]

    def get_service(self):
        return self.service_class()

    def _business_id(self):
        return parse_business_id(self.request)

    def list(self, request):
        business_id = self._business_id()
        items = self.get_service().list_roles_for_business(business_id)
        payload = self.serializer_class(items, many=True, context={"request": request}).data
        return ApiResponse.success(data={"items": payload}, message="Business roles fetched")

    def create(self, request):
        serializer = BusinessRoleWriteSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        business_id = self._business_id()
        instance = self.get_service().create_role(business_id, serializer.validated_data)
        payload = self.serializer_class(instance, context={"request": request}).data
        return ApiResponse.success(
            data=payload,
            message="Role created",
            status_code=status.HTTP_201_CREATED,
        )
