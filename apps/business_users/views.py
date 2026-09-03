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
        items = self.get_service().list_for_business(business_id)
        payload = self.serializer_class(items, many=True, context={"request": request}).data
        return ApiResponse.success(data={"items": payload}, message="Business users fetched")

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
