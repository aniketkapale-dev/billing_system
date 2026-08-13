"""
Auth views. Thin: validate payload, call AuthService, return ApiResponse.
"""
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.viewsets import ViewSet

from apps.accounts.serializers import (
    ChangePasswordSerializer,
    ForgotPasswordSerializer,
    LoginSerializer,
    ProfileSerializer,
    RefreshSerializer,
    RegisterSerializer,
    ResetPasswordSerializer,
    UpdateProfileSerializer,
)
from apps.accounts.services import AuthService
from core.base_response import ApiResponse


class AuthViewSet(ViewSet):
    service = AuthService()

    def get_permissions(self):
        public = {"login", "register", "refresh", "forgot_password", "reset_password"}
        if self.action in public:
            return [AllowAny()]
        return [IsAuthenticated()]

    @action(detail=False, methods=["post"])
    def register(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = self.service.register(**serializer.validated_data)
        return ApiResponse.success(
            data={},
            message=result["message"],
            status_code=201,
        )

    @action(detail=False, methods=["post"])
    def login(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = self.service.login(**serializer.validated_data)
        profile = ProfileSerializer(result["user"], context={"request": request}).data
        return ApiResponse.success(
            data={"tokens": result["tokens"], "user": profile},
            message="Login successful",
        )

    @action(detail=False, methods=["post"])
    def logout(self, request):
        self.service.logout(request.user)
        return ApiResponse.success(message="Logout successful")

    @action(detail=False, methods=["post"])
    def refresh(self, request):
        serializer = RefreshSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = self.service.refresh(serializer.validated_data["refresh"])
        return ApiResponse.success(data=result, message="Token refreshed")

    @action(detail=False, methods=["post"], url_path="forgot-password")
    def forgot_password(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = self.service.forgot_password(serializer.validated_data["email"])
        return ApiResponse.success(data=result, message="Password reset initiated")

    @action(detail=False, methods=["post"], url_path="reset-password")
    def reset_password(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.service.reset_password(**serializer.validated_data)
        return ApiResponse.success(message="Password reset successful")

    @action(detail=False, methods=["post"], url_path="change-password")
    def change_password(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.service.change_password(request.user, **serializer.validated_data)
        return ApiResponse.success(message="Password changed successfully")

    @action(detail=False, methods=["get"])
    def me(self, request):
        profile = ProfileSerializer(request.user, context={"request": request}).data
        return ApiResponse.success(data=profile, message="Current user")

    @action(detail=False, methods=["patch"], url_path="me")
    def update_me(self, request):
        serializer = UpdateProfileSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        user = self.service.update_profile(request.user, **serializer.validated_data)
        profile = ProfileSerializer(user, context={"request": request}).data
        return ApiResponse.success(data=profile, message="Profile updated successfully")
