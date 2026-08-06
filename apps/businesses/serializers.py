from rest_framework import serializers

from apps.businesses.models import Business
from core.base_serializer import BaseModelSerializer


class BusinessSerializer(BaseModelSerializer):
    owner_name = serializers.CharField(source="owner.full_name", read_only=True)

    class Meta:
        model = Business
        fields = (
            "id",
            "owner",
            "owner_name",
            "name",
            "is_active",
            "is_deleted",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("owner",)


class BusinessWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Business
        fields = ("name", "is_active")
