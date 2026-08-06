"""
BaseSerializer: shared serializer behaviour. Concrete serializers inherit this
and expose audit fields as read-only so they can never be set from the client.
"""
from rest_framework import serializers


class BaseModelSerializer(serializers.ModelSerializer):
    """Marks BaseEntity audit fields read-only across every serializer."""

    AUDIT_READONLY = (
        "id", "created_at", "updated_at", "deleted_at",
        "created_by", "updated_by", "deleted_by",
        "created_ip", "updated_ip", "deleted_ip",
        "is_deleted",
    )

    def get_fields(self):
        fields = super().get_fields()
        for name in self.AUDIT_READONLY:
            if name in fields:
                fields[name].read_only = True
        return fields
