import json

from django.db.models import Q
from rest_framework import status

from apps.invoicing.models import (
    InventoryBatch,
    PurchaseInvoice,
    PurchaseInvoiceItem,
    PurchaseReturnItem,
)
from apps.invoicing.serializers import (
    InventoryBatchSerializer,
    PurchaseInvoiceHeaderWriteSerializer,
    PurchaseInvoiceSerializer,
    PurchaseInvoiceWriteSerializer,
    PurchaseReturnWriteSerializer,
)
from apps.invoicing.services import PurchaseInvoiceService
from apps.invoicing.return_services import PurchaseReturnService
from apps.invoicing.repositories import InventoryBatchRepository
from core.base_response import ApiResponse
from core.base_viewset import BaseViewSet
from core.business_viewset import BusinessScopedViewSetMixin
from core.pagination import StandardPagination
from core.permissions import HasRole, IsAuthenticatedUser
from core.exceptions import NotFoundException, ValidationException


class PurchaseInvoiceViewSet(BusinessScopedViewSetMixin, BaseViewSet):
    service_class = PurchaseInvoiceService
    serializer_class = PurchaseInvoiceSerializer
    write_serializer_class = PurchaseInvoiceWriteSerializer
    search_fields = ("invoice_number", "remarks")
    filter_fields = ("invoice_number",)
    required_roles = ["Business Owner", "Business Staff"]
    required_tab = "stock-in"
    ordering_default = ("-created_at",)
    ordering_fields = {
        "created_at": "created_at",
        "invoice_date": "invoice_date",
        "invoice_number": "invoice_number",
        "subtotal": "subtotal",
        "grand_total": "grand_total",
    }

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")
        if date_from:
            queryset = queryset.filter(invoice_date__gte=date_from)
        if date_to:
            queryset = queryset.filter(invoice_date__lte=date_to)
        return queryset

    def _merge_request_data(self, request):
        data = {}
        if hasattr(request.data, "keys"):
            for key in request.data.keys():
                data[key] = request.data.get(key)
        for key in request.FILES.keys():
            data[key] = request.FILES.get(key)
        items = data.get("items")
        if isinstance(items, str):
            try:
                data["items"] = json.loads(items)
            except (TypeError, ValueError):
                pass
        new_items = data.get("new_items")
        if isinstance(new_items, str):
            try:
                data["new_items"] = json.loads(new_items)
            except (TypeError, ValueError):
                pass
        return data

    def get_permissions(self):
        return [IsAuthenticatedUser(), HasRole()]

    def create(self, request):
        data = self._merge_request_data(request)
        serializer = self.get_write_serializer(
            data=data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        data = self.inject_business_scope(dict(serializer.validated_data))
        instance = self.get_service().create_with_items(data)
        payload = self.serializer_class(instance, context={"request": request}).data
        return ApiResponse.success(
            data=payload,
            message="Purchase invoice recorded and inventory batches created.",
            status_code=status.HTTP_201_CREATED,
        )

    def update(self, request, pk=None):
        return ApiResponse.error(
            message="Use PATCH to update purchase invoice details.",
            status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def partial_update(self, request, pk=None):
        data = self._merge_request_data(request)
        serializer = PurchaseInvoiceHeaderWriteSerializer(
            data=data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        validated = dict(serializer.validated_data)
        new_items = validated.pop("new_items", None)
        instance = self.get_service().update_invoice(
            pk,
            header_data=validated,
            new_items=new_items,
        )
        message = "Purchase invoice updated."
        if new_items:
            count = len(new_items)
            message = (
                "Purchase invoice updated and "
                + ("1 product added." if count == 1 else f"{count} products added.")
            )
        payload = self.serializer_class(instance, context={"request": request}).data
        return ApiResponse.success(
            data=payload,
            message=message,
        )

    def destroy(self, request, pk=None):
        partial_recreate = request.query_params.get("partial_recreate") in ("1", "true", "yes")
        if partial_recreate:
            self.get_service().soft_delete_for_recreate(pk)
            return ApiResponse.success(message="Unsold purchase lines removed for re-create.")
        self.get_service().soft_delete(pk)
        return ApiResponse.success(message="Purchase invoice deleted.")


class PurchaseReturnViewSet(BusinessScopedViewSetMixin, BaseViewSet):
    required_roles = ["Business Owner", "Business Staff"]
    required_tab = "stock-in"

    def get_permissions(self):
        return [IsAuthenticatedUser(), HasRole()]

    def list(self, request):
        business_id = self.get_active_business().id
        purchase_invoice_id = request.query_params.get("purchase_invoice_id")
        service = PurchaseReturnService()
        if purchase_invoice_id:
            try:
                invoice_id = int(purchase_invoice_id)
            except (TypeError, ValueError) as exc:
                raise ValidationException("Purchase invoice id must be a valid number.") from exc
            invoices = service.list_returnable_purchases(business_id, [invoice_id])
            if not invoices:
                raise NotFoundException("Purchase invoice not found.")
            return ApiResponse.success(data=invoices[0])

        queryset = PurchaseReturnItem.objects.filter(
            purchase_return__business_id=business_id,
            purchase_return__is_deleted=False,
            purchase_return__is_active=True,
            is_deleted=False,
            is_active=True,
        ).select_related(
            "purchase_return",
            "purchase_return__purchase_invoice",
            "purchase_invoice_item",
            "purchase_invoice_item__product",
        )
        search = request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(purchase_return__purchase_invoice__invoice_number__icontains=search)
                | Q(purchase_return__reason__icontains=search)
                | Q(purchase_invoice_item__product__name__icontains=search)
                | Q(purchase_invoice_item__product__sku__icontains=search)
            )
        paginator = StandardPagination()
        page = paginator.paginate_queryset(
            queryset.order_by("-purchase_return__created_at", "-id"),
            request,
            view=self,
        )
        rows = [
            {
                "id": item.id,
                "returned_at": item.purchase_return.created_at,
                "invoice_id": item.purchase_return.purchase_invoice_id,
                "invoice_number": item.purchase_return.purchase_invoice.invoice_number,
                "product_name": item.purchase_invoice_item.product.name,
                "product_sku": item.purchase_invoice_item.product.sku,
                "batch_number": item.purchase_invoice_item.batch_number,
                "quantity": item.quantity,
                "reason": item.purchase_return.reason,
            }
            for item in page
        ]
        return paginator.get_paginated_response(rows)

    def create(self, request):
        serializer = PurchaseReturnWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        purchase_return = PurchaseReturnService().return_items(
            business_id=self.get_active_business().id,
            purchase_invoice_id=data["purchase_invoice_id"],
            items=data["items"],
            reason=data["reason"],
        )
        return ApiResponse.success(
            data={
                "id": purchase_return.id,
                "purchase_invoice_id": purchase_return.purchase_invoice_id,
                "items": [
                    {
                        "purchase_invoice_item_id": item.purchase_invoice_item_id,
                        "product_name": item.purchase_invoice_item.product.name,
                        "quantity": str(item.quantity),
                    }
                    for item in purchase_return.items.select_related(
                        "purchase_invoice_item__product"
                    )
                ],
            },
            message="Purchase return recorded and stock updated.",
            status_code=status.HTTP_201_CREATED,
        )


class InventoryBatchViewSet(BusinessScopedViewSetMixin, BaseViewSet):
    service_class = None
    serializer_class = InventoryBatchSerializer
    search_fields = ("product__name", "product__sku", "batch_number")
    filter_fields = ("product", "batch_number")
    required_roles = ["Business Owner", "Business Staff"]
    required_tab = "inventory"
    ordering_default = ("created_at",)
    ordering_fields = {
        "created_at": "created_at",
        "expiry_date": "expiry_date",
        "available_quantity": "available_quantity",
        "product_name": "product__name",
        "batch_number": "batch_number",
        "purchase_price": "purchase_price",
        "selling_price": "selling_price",
        "invoice_number": "purchase_invoice_item__purchase_invoice__invoice_number",
        "invoice_date": "purchase_invoice_item__purchase_invoice__invoice_date",
    }

    def get_permissions(self):
        return [IsAuthenticatedUser(), HasRole()]

    def get_service(self):
        from core.base_service import BaseService

        class _BatchListService(BaseService):
            repository = InventoryBatchRepository()

        return _BatchListService()

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)
        in_stock = self.request.query_params.get("in_stock")
        if in_stock == "true":
            queryset = queryset.filter(available_quantity__gt=0)
        product_id = self.request.query_params.get("product_id")
        if product_id:
            queryset = queryset.filter(product_id=product_id)
        unit_id = self.request.query_params.get("unit_id")
        if unit_id:
            queryset = queryset.filter(product__unit_id=unit_id)
        expiry_from = self.request.query_params.get("expiry_from")
        expiry_to = self.request.query_params.get("expiry_to")
        if expiry_from:
            queryset = queryset.filter(expiry_date__gte=expiry_from)
        if expiry_to:
            queryset = queryset.filter(expiry_date__lte=expiry_to)
        if expiry_from or expiry_to:
            queryset = queryset.filter(expiry_date__isnull=False)
        return queryset
