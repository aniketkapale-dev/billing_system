"""
Serializers for auth request payloads and the current-user profile response.
"""
from rest_framework import serializers

from core.utils import build_absolute_uri


class LoginSerializer(serializers.Serializer):
    email = serializers.CharField(max_length=254)
    password = serializers.CharField(write_only=True)


class RegisterSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150)
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    mobile_number = serializers.CharField(min_length=10, max_length=10)
    password = serializers.CharField(min_length=8, write_only=True)

    def validate_email(self, value):
        if not value or not str(value).strip():
            return ""
        return value.strip().lower()

    def validate_mobile_number(self, value):
        from core.validators import validate_mobile_number

        return validate_mobile_number(value)


class RefreshSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ResetPasswordSerializer(serializers.Serializer):
    reset_token = serializers.CharField()
    new_password = serializers.CharField(min_length=8, write_only=True)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(min_length=8, write_only=True)


class ProfileSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    full_name = serializers.CharField(read_only=True)
    email = serializers.EmailField(read_only=True)
    mobile_number = serializers.CharField(read_only=True)
    is_active = serializers.BooleanField(read_only=True)
    profile_image = serializers.SerializerMethodField()
    roles = serializers.SerializerMethodField()

    def get_profile_image(self, obj):
        request = self.context.get("request")
        return build_absolute_uri(request, obj.profile_image)

    def get_roles(self, obj):
        return obj.role_names
