from datetime import datetime, time, timedelta
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.views import APIView
from core.business_access import require_business_owner
from core.pagination import StandardPagination
from core.permissions import IsAuthenticatedUser
from .models import ActivityLog


class ActivityLogSerializer(serializers.ModelSerializer):
    description = serializers.SerializerMethodField()

    def get_description(self, obj):
        # Render older entries clearly without rewriting the saved audit record.
        description = obj.description
        for label, change in obj.changes.items():
            old, new = change.get("before", ""), change.get("after", "")
            for separator in (" ? ", " \u2192 "):
                description = description.replace(f"{label}: {old}{separator}{new}", f"{label}: {old} to {new}")
        name = obj.changes.get("Name")
        if obj.record_type == "products.Product" and obj.action == "updated" and name:
            prefix = f'Updated product "{name["after"]}".'
            if description.startswith(prefix):
                description = description.replace(prefix, f'Renamed product from "{name["before"]}" to "{name["after"]}".', 1)
                description = description.replace(f'Name: {name["before"]} to {name["after"]}', "", 1)
                description = description.replace(". ; ", ". ").replace(". .", ".").strip()
        return description

    class Meta:
        model = ActivityLog
        fields = ("id", "occurred_at", "actor_name", "area", "action", "description")


class ActivityLogListView(APIView):
    permission_classes = [IsAuthenticatedUser]

    def get(self, request):
        business, _ = require_business_owner(request)
        rows = ActivityLog.objects.filter(business=business)
        search = request.query_params.get("search", "").strip()
        if search:
            rows = rows.filter(Q(description__icontains=search) | Q(actor_name__icontains=search))
        if request.query_params.get("area"):
            rows = rows.filter(area=request.query_params["area"])
        for key, lookup in (("date_from", "occurred_at__gte"), ("date_to", "occurred_at__lt")):
            value = request.query_params.get(key)
            if value:
                try:
                    date = datetime.strptime(value, "%Y-%m-%d").date()
                except ValueError:
                    raise ValidationError({key: "Enter a valid date."})
                if key == "date_to":
                    date += timedelta(days=1)
                rows = rows.filter(**{lookup: timezone.make_aware(datetime.combine(date, time.min))})
        paginator = StandardPagination()
        page = paginator.paginate_queryset(rows, request)
        return paginator.get_paginated_response(ActivityLogSerializer(page, many=True).data)
