"""
BaseViewSet: thin presentation layer. Views only receive the request, delegate
to the service, and wrap the result in the standard ApiResponse envelope.

Provides: list, create, retrieve (details), update, partial_update,
destroy (soft delete) and a `restore` action. CRUD code is written once here.
"""
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.viewsets import GenericViewSet

from core.base_response import ApiResponse


class BaseViewSet(GenericViewSet):
    """
    Subclasses must set:
        service_class    -> a BaseService subclass
        serializer_class -> read/serialize serializer
        write_serializer_class (optional) -> validation on create/update
    """

    service_class = None
    serializer_class = None
    write_serializer_class = None
    search_fields = ()
    ordering_default = ("-created_at",)

    def get_permissions(self):
        if self.action in ["list", "retrieve"]:
            from rest_framework.permissions import AllowAny
            return [AllowAny()]
        return super().get_permissions()

    # -- helpers -----------------------------------------------------------
    def get_service(self):
        return self.service_class()

    def get_write_serializer(self, *args, **kwargs):
        cls = self.write_serializer_class or self.serializer_class
        return cls(*args, **kwargs)
    
    def filter_queryset(self, queryset):
        """
        Hook for child viewsets to apply additional filters.
        """
        return queryset

    def _apply_query(self, queryset):
        request = self.request

        # Global search
        search = request.query_params.get("search")
        if search and self.search_fields:
            from django.db.models import Q

            q = Q()
            for field in self.search_fields:
                q |= Q(**{f"{field}__icontains": search})

            queryset = queryset.filter(q)

        # Dynamic field filters
        filters = getattr(self, "filter_fields", ())

        for field in filters:
            value = request.query_params.get(field)

            if value:
                queryset = queryset.filter(**{
                    f"{field}__icontains": value
                })

        # Ordering
        ordering = request.query_params.get("ordering")

        if ordering:
            ordering_fields = getattr(self, "ordering_fields", {})
            order_by = []

            for field in ordering.split(","):
                field = field.strip()

                desc = field.startswith("-")
                name = field[1:] if desc else field

                mapped = ordering_fields.get(name, name)

                order_by.append("-" + mapped if desc else mapped)

            queryset = queryset.order_by(*order_by)
        else:
            queryset = queryset.order_by(*self.ordering_default)

        return queryset

    def _paginate(self, queryset):
        from core.pagination import StandardPagination

        paginator = StandardPagination()
        page = paginator.paginate_queryset(queryset, self.request, view=self)
        serializer = self.serializer_class(page, many=True, context={"request": self.request})
        return paginator.get_paginated_response(serializer.data)

    # -- CRUD --------------------------------------------------------------
    def list(self, request):
        include_deleted = request.query_params.get("include_deleted") == "true"
        service = self.get_service()
        queryset = (
            service.repository.all_with_deleted()
            if include_deleted
            else service.list()
        )
        queryset = self.filter_queryset(queryset)
        queryset = self._apply_query(queryset)
        return self._paginate(queryset)

    def retrieve(self, request, pk=None):
        instance = self.get_service().get(pk, include_deleted=True)
        data = self.serializer_class(instance, context={"request": request}).data
        return ApiResponse.success(data=data, message="Record fetched")

    def create(self, request):
        serializer = self.get_write_serializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        instance = self.get_service().create(serializer.validated_data)
        data = self.serializer_class(instance, context={"request": request}).data
        return ApiResponse.success(
            data=data, message="Record created", status_code=status.HTTP_201_CREATED
        )

    def update(self, request, pk=None):
        instance = self.get_service().get(pk)

        serializer = self.get_write_serializer(
            instance=instance,
            data=request.data,
            partial=False,
            context={"request": request}
        )
        serializer.is_valid(raise_exception=True)

        instance = self.get_service().update(pk, serializer.validated_data)
        data = self.serializer_class(instance, context={"request": request}).data
        return ApiResponse.success(data=data, message="Record updated")

    def partial_update(self, request, pk=None):
        instance = self.get_service().get(pk)

        serializer = self.get_write_serializer(
            instance=instance,
            data=request.data,
            partial=True,
            context={"request": request}
        )
        serializer.is_valid(raise_exception=True)

        instance = self.get_service().update(pk, serializer.validated_data)
        data = self.serializer_class(instance, context={"request": request}).data
        return ApiResponse.success(data=data, message="Record updated")
    
    def destroy(self, request, pk=None):
        self.get_service().soft_delete(pk)
        return ApiResponse.success(message="Record deleted")

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        instance = self.get_service().restore(pk)
        data = self.serializer_class(instance, context={"request": request}).data
        return ApiResponse.success(data=data, message="Record restored")
    
    def get_serializer(self, *args, **kwargs):
        return self.serializer_class(*args, **kwargs)
