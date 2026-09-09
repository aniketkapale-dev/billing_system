from rest_framework import status

from apps.purchases.serializers import (
    PurchaseDraftUpdateSerializer,
    PurchaseFinalizeSerializer,
    PurchaseHeaderWriteSerializer,
    PurchasePaymentSerializer,
    PurchasePaymentWriteSerializer,
    PurchaseSerializer,
    PurchaseWriteSerializer,
)
from apps.purchases.services import PurchaseService
from core.base_response import ApiResponse
from core.base_viewset import BaseViewSet
from core.business_viewset import BusinessScopedViewSetMixin
from core.permissions import HasRole, IsAuthenticatedUser


class PurchaseViewSet(BusinessScopedViewSetMixin, BaseViewSet):
    service_class = PurchaseService
    serializer_class = PurchaseSerializer
    write_serializer_class = PurchaseWriteSerializer
    search_fields = ("customer_name", "reference_no", "notes")
    filter_fields = ("customer_name", "reference_no")
    required_roles = ["Business Owner", "Business Staff"]
    required_tab = "purchases"
    ordering_default = ("-purchase_date", "-created_at")
    ordering_fields = {
        "purchase_date": "purchase_date",
        "reference_no": "reference_no",
        "customer_name": "customer_name",
        "total_amount": "total_amount",
        "total_cost": "total_cost",
        "total_profit": "total_profit",
    }

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")
        invoice_status = self.request.query_params.get("invoice_status")
        if date_from:
            queryset = queryset.filter(purchase_date__gte=date_from)
        if date_to:
            queryset = queryset.filter(purchase_date__lte=date_to)
        if invoice_status:
            status_value = invoice_status.lower()
            if status_value == "paid":
                queryset = queryset.filter(is_cancelled=False, is_draft=False, is_paid=True)
            elif status_value == "pending":
                queryset = queryset.filter(is_cancelled=False, is_draft=False, is_paid=False)
            elif status_value == "draft":
                queryset = queryset.filter(is_cancelled=False, is_draft=True)
            elif status_value == "cancelled":
                queryset = queryset.filter(is_cancelled=True)
        return queryset

    def get_permissions(self):
        return [IsAuthenticatedUser(), HasRole()]

    def create(self, request):
        serializer = self.get_write_serializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        data = self.inject_business_scope(dict(serializer.validated_data))
        is_draft = bool(data.get("is_draft", False))
        instance = self.get_service().create_with_items(data)
        payload = self.serializer_class(instance, context={"request": request}).data
        message = (
            "Sale saved as draft. Stock was not updated. Invoice number will be assigned when finalized."
            if is_draft
            else "Sale added successfully. Stock has been updated."
        )
        return ApiResponse.success(
            data=payload,
            message=message,
            status_code=status.HTTP_201_CREATED,
        )

    def update(self, request, pk=None):
        return ApiResponse.error(
            message="Use PATCH to update sale details.",
            status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def partial_update(self, request, pk=None):
        service = self.get_service()
        purchase = service.get(pk)

        if purchase.is_draft:
            serializer = PurchaseDraftUpdateSerializer(
                data=request.data,
                partial=True,
                context={"request": request},
            )
            serializer.is_valid(raise_exception=True)
            instance = service.update_draft_with_items(pk, dict(serializer.validated_data))
            payload = self.serializer_class(instance, context={"request": request}).data
            return ApiResponse.success(
                data=payload,
                message="Draft sale updated successfully. Invoice number will be assigned when finalized.",
            )

        serializer = PurchaseHeaderWriteSerializer(
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        if "items" in request.data:
            return ApiResponse.error(
                message="Sale line items cannot be changed after the invoice is created.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        instance = service.update_header(pk, validated)
        payload = self.serializer_class(instance, context={"request": request}).data
        return ApiResponse.success(
            data=payload,
            message="Sale updated successfully.",
        )

    def finalize(self, request, pk=None):
        serializer = PurchaseFinalizeSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        instance = self.get_service().finalize_draft(pk, dict(serializer.validated_data))
        payload = self.serializer_class(instance, context={"request": request}).data
        return ApiResponse.success(
            data=payload,
            message="Draft sale finalized. Stock has been updated.",
        )

    def mark_paid(self, request, pk=None):
        service = self.get_service()
        purchase = service.get(pk)
        already_paid = purchase.is_paid
        instance = service.mark_as_paid(pk)
        payload = self.serializer_class(instance, context={"request": request}).data
        message = "Sale is already marked as paid." if already_paid else "Payment recorded. Sale marked as paid."
        return ApiResponse.success(data=payload, message=message)

    def list_payments(self, request, pk=None):
        payments = self.get_service().list_payments(pk)
        payload = PurchasePaymentSerializer(payments, many=True, context={"request": request}).data
        return ApiResponse.success(data=payload, message="Payment history loaded.")

    def record_payment(self, request, pk=None):
        serializer = PurchasePaymentWriteSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        instance = self.get_service().record_payment(pk, dict(serializer.validated_data))
        payload = self.serializer_class(instance, context={"request": request}).data
        return ApiResponse.success(
            data=payload,
            message="Payment recorded successfully.",
            status_code=status.HTTP_201_CREATED,
        )

    def mark_cancelled(self, request, pk=None):
        service = self.get_service()
        purchase = service.get(pk)
        already_cancelled = purchase.is_cancelled
        was_draft = purchase.is_draft
        reason = request.data.get("cancellation_reason", "")
        cancellation_date = request.data.get("cancellation_date")
        instance = service.mark_as_cancelled(pk, reason=reason, cancellation_date=cancellation_date)
        payload = self.serializer_class(instance, context={"request": request}).data
        message = (
            "Invoice is already cancelled."
            if already_cancelled
            else (
                "Draft sale deleted. Invoice number has been released."
                if was_draft
                else "Invoice cancelled. Stock has been restored."
            )
        )
        return ApiResponse.success(data=payload, message=message)

    def destroy(self, request, pk=None):
        return ApiResponse.error(
            message="Purchase delete is not supported.",
            status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        )
