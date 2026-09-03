from rest_framework import serializers

from apps.businesses.models import Business
from apps.users.models import User
from core.base_serializer import BaseModelSerializer
from core.utils import build_absolute_uri


class UserBusinessSummarySerializer(BaseModelSerializer):
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = Business
        fields = (
            "id",
            "business_name",
            "gst_number",
            "phone",
            "email",
            "address",
            "logo_url",
            "is_active",
            "created_at",
            "updated_at",
        )

    def get_logo_url(self, obj):
        return build_absolute_uri(self.context.get("request"), obj.logo)


class UserSerializer(BaseModelSerializer):
    profile_image_url = serializers.SerializerMethodField()
    roles = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id", "full_name", "email", "mobile_number",
            "profile_image", "profile_image_url", "roles",
            "is_active", "is_deleted", "created_at", "approved_at", "updated_at",
        )
        extra_kwargs = {"profile_image": {"write_only": True, "required": False}}

    def get_profile_image_url(self, obj):
        return build_absolute_uri(self.context.get("request"), obj.profile_image)

    def get_roles(self, obj):
        return obj.role_names


class UserDetailSerializer(UserSerializer):
    businesses = serializers.SerializerMethodField()

    class Meta(UserSerializer.Meta):
        fields = UserSerializer.Meta.fields + ("businesses",)

    def get_businesses(self, obj):
        businesses = obj.businesses.filter(is_deleted=False).order_by("-created_at")
        return UserBusinessSummarySerializer(
            businesses, many=True, context=self.context
        ).data


class UserWriteSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, min_length=8)

    class Meta:
        model = User
        fields = (
            "full_name", "email", "mobile_number",
            "password", "profile_image", "is_active",
        )
