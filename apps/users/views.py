from apps.users.serializers import UserSerializer, UserWriteSerializer
from apps.users.services import UserService
from core.base_viewset import BaseViewSet


class UserViewSet(BaseViewSet):
    service_class = UserService
    serializer_class = UserSerializer
    write_serializer_class = UserWriteSerializer
    search_fields = ("full_name", "email", "mobile_number")
