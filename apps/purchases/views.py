from rest_framework import status
from rest_framework.views import APIView

from apps.purchases.repositories import ServiceSaleRepository
from apps.purchases.serializers import (
    PurchaseDraftUpdateSerializer,
    PurchaseFinalizeSerializer,
    PurchaseHeaderWriteSerializer,
    PurchasePaymentSerializer,
    PurchasePaymentWriteSerializer,
    PurchaseListSerializer,
    PurchaseSerializer,
    PurchaseWriteSerializer,
    SaleDueSettingSerializer,
    SaleDueSettingWriteSerializer,
    ServiceSaleDraftUpdateSerializer,
    ServiceSaleFinalizeSerializer,
    ServiceSaleHeaderWriteSerializer,
    ServiceSaleListSerializer,
    ServiceSalePaymentSerializer,
    ServiceSalePaymentWriteSerializer,
    ServiceSaleSerializer,
    ServiceSaleWriteSerializer,
)
from apps.purchases.services import PurchaseService, SaleDueSettingService, ServiceSaleService
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
    ordering_default = ("-created_at",)
    ordering_fields = {
        "created_at": "created_at",
        "purchase_date": "purchase_date",
        "reference_no": "reference_no",
        "customer_name": "customer_name",
        "total_amount": "total_amount",
        "total_cost": "total_cost",
        "total_profit": "total_profit",
    }

    def list(self, request):
        from core.pagination import StandardPagination

        sale_type = (request.query_params.get("sale_type") or "").strip().lower()
        if sale_type not in ("", "product", "service"):
            sale_type = ""

        context = {"request": request}
        rows = []

        if sale_type in ("", "product"):
            product_qs = self.get_service().repository.get_list_queryset()
            product_qs = self.filter_queryset(product_qs)
            product_qs = self._apply_query(product_qs)
            rows.extend(PurchaseListSerializer(product_qs, many=True, context=context).data)

        if sale_type in ("", "service"):
            service_qs = (
                ServiceSaleRepository()
                .get_list_queryset()
                .filter(business_id=self.get_active_business().id)
            )
            service_qs = self._filter_service_sale_queryset(service_qs)
            service_qs = self._apply_service_sale_query(service_qs)
            rows.extend(ServiceSaleListSerializer(service_qs, many=True, context=context).data)

        rows = self._sort_combined_sale_rows(rows, request.query_params.get("ordering"))

        paginator = StandardPagination()
        page = paginator.paginate_queryset(rows, request, view=self)
        return paginator.get_paginated_response(page)

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
            if status_value == "finalized":
                queryset = queryset.filter(is_cancelled=False, is_draft=False)
            elif status_value == "paid":
                queryset = queryset.filter(is_cancelled=False, is_draft=False, is_paid=True)
            elif status_value == "pending":
                queryset = queryset.filter(is_cancelled=False, is_draft=False, is_paid=False)
            elif status_value == "draft":
                queryset = queryset.filter(is_cancelled=False, is_draft=True)
            elif status_value == "cancelled":
                queryset = queryset.filter(is_cancelled=True)
        return queryset

    def _filter_service_sale_queryset(self, queryset):
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")
        invoice_status = self.request.query_params.get("invoice_status")
        if date_from:
            queryset = queryset.filter(sale_date__gte=date_from)
        if date_to:
            queryset = queryset.filter(sale_date__lte=date_to)
        if invoice_status:
            status_value = invoice_status.lower()
            if status_value == "finalized":
                queryset = queryset.filter(is_cancelled=False, is_draft=False)
            elif status_value == "paid":
                queryset = queryset.filter(is_cancelled=False, is_draft=False, is_paid=True)
            elif status_value == "pending":
                queryset = queryset.filter(is_cancelled=False, is_draft=False, is_paid=False)
            elif status_value == "draft":
                queryset = queryset.filter(is_cancelled=False, is_draft=True)
            elif status_value == "cancelled":
                queryset = queryset.filter(is_cancelled=True)
        return queryset

    def _apply_service_sale_query(self, queryset):
        from django.db.models import Q

        search = self.request.query_params.get("search")
        if search:
            q = Q()
            for field in self.search_fields:
                q |= Q(**{f"{field}__icontains": search})
            queryset = queryset.filter(q)

        for field in getattr(self, "filter_fields", ()):
            value = self.request.query_params.get(field)
            if value:
                queryset = queryset.filter(**{f"{field}__icontains": value})

        return queryset

    @staticmethod
    def _sort_combined_sale_rows(rows, ordering):
        ordering = (ordering or "-created_at").strip()
        reverse = ordering.startswith("-")
        field = ordering.lstrip("-") or "created_at"
        allowed = {
            "created_at",
            "purchase_date",
            "reference_no",
            "customer_name",
            "total_amount",
        }
        if field not in allowed:
            field = "created_at"
            reverse = True

        def sort_key(row):
            value = row.get(field)
            if value is None:
                return ""
            return value

        rows.sort(key=sort_key, reverse=reverse)
        return rows

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

    def save_invoice_pdf(self, request, pk=None):
        service = self.get_service()
        purchase = service.get(pk)
        business = self.get_active_business()
        if purchase.business_id != business.id:
            return ApiResponse.error(
                message="Sale not found.",
                status_code=status.HTTP_404_NOT_FOUND,
            )

        upload = request.FILES.get("file")
        if not upload:
            return ApiResponse.error(
                message="PDF file is required.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        if purchase.invoice_pdf:
            purchase.invoice_pdf.delete(save=False)
        purchase.invoice_pdf.save("purchase-%s.pdf" % purchase.pk, upload, save=True)
        url = request.build_absolute_uri(purchase.invoice_pdf.url)
        return ApiResponse.success(
            data={"url": url},
            message="Sale invoice PDF saved.",
        )

    def destroy(self, request, pk=None):
        return ApiResponse.error(
            message="Purchase delete is not supported.",
            status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        )


class SaleDueSettingView(APIView):
    required_roles = ["Business Owner", "Business Staff"]
    required_tab = "purchases"
    permission_classes = [IsAuthenticatedUser, HasRole]

    def _get_business(self, request):
        from core.business_access import resolve_business_access, user_has_tab

        business, access = resolve_business_access(request)
        if not user_has_tab(access, self.required_tab):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You do not have access to this section.")
        return business

    def get(self, request):
        business = self._get_business(request)
        setting = SaleDueSettingService().get_or_create_for_business(business.id)
        payload = SaleDueSettingSerializer(setting).data
        return ApiResponse.success(data=payload, message="Sale due settings")

    def patch(self, request):
        business = self._get_business(request)
        serializer = SaleDueSettingWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        service = SaleDueSettingService()
        setting = service.update(
            business.id,
            serializer.validated_data["default_due_days_after_sale"],
        )
        updated_count = 0
        if serializer.validated_data.get("apply_pending", True):
            updated_count = service.apply_to_pending_sales(business.id)
        payload = SaleDueSettingSerializer(setting).data
        payload["updated_pending_count"] = updated_count
        message = "Sale due settings saved."
        if updated_count:
            message = f"Sale due settings saved. Due date applied to {updated_count} pending invoice(s)."
        return ApiResponse.success(data=payload, message=message)


class ServiceSaleViewSet(BusinessScopedViewSetMixin, BaseViewSet):
    service_class = ServiceSaleService
    serializer_class = ServiceSaleSerializer
    write_serializer_class = ServiceSaleWriteSerializer
    search_fields = ("customer_name", "reference_no", "notes")
    filter_fields = ("customer_name", "reference_no")
    required_roles = ["Business Owner", "Business Staff"]
    required_tab = "purchases"
    ordering_default = ("-created_at",)
    ordering_fields = {
        "created_at": "created_at",
        "sale_date": "sale_date",
        "reference_no": "reference_no",
        "customer_name": "customer_name",
        "total_amount": "total_amount",
    }

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
            "Service sale saved as draft. Invoice number will be assigned when finalized."
            if is_draft
            else "Service sale added successfully."
        )
        return ApiResponse.success(
            data=payload,
            message=message,
            status_code=status.HTTP_201_CREATED,
        )

    def update(self, request, pk=None):
        return ApiResponse.error(
            message="Use PATCH to update service sale details.",
            status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def partial_update(self, request, pk=None):
        service = self.get_service()
        sale = service.get(pk)

        if sale.is_draft:
            serializer = ServiceSaleDraftUpdateSerializer(
                data=request.data,
                partial=True,
                context={"request": request},
            )
            serializer.is_valid(raise_exception=True)
            instance = service.update_draft_with_items(pk, dict(serializer.validated_data))
            payload = self.serializer_class(instance, context={"request": request}).data
            return ApiResponse.success(
                data=payload,
                message="Draft service sale updated successfully. Invoice number will be assigned when finalized.",
            )

        serializer = ServiceSaleHeaderWriteSerializer(
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        if "items" in request.data:
            return ApiResponse.error(
                message="Service sale line items cannot be changed after the invoice is created.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        instance = service.update_header(pk, dict(serializer.validated_data))
        payload = self.serializer_class(instance, context={"request": request}).data
        return ApiResponse.success(
            data=payload,
            message="Service sale updated successfully.",
        )

    def finalize(self, request, pk=None):
        serializer = ServiceSaleFinalizeSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        instance = self.get_service().finalize_draft(pk, dict(serializer.validated_data))
        payload = self.serializer_class(instance, context={"request": request}).data
        return ApiResponse.success(
            data=payload,
            message="Draft service sale finalized.",
        )

    def mark_paid(self, request, pk=None):
        service = self.get_service()
        sale = service.get(pk)
        already_paid = sale.is_paid
        instance = service.mark_as_paid(pk)
        payload = self.serializer_class(instance, context={"request": request}).data
        message = (
            "Service sale is already marked as paid."
            if already_paid
            else "Payment recorded. Service sale marked as paid."
        )
        return ApiResponse.success(data=payload, message=message)

    def list_payments(self, request, pk=None):
        payments = self.get_service().list_payments(pk)
        payload = ServiceSalePaymentSerializer(
            payments, many=True, context={"request": request}
        ).data
        return ApiResponse.success(data=payload, message="Payment history loaded.")

    def record_payment(self, request, pk=None):
        serializer = ServiceSalePaymentWriteSerializer(
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
        sale = service.get(pk)
        already_cancelled = sale.is_cancelled
        was_draft = sale.is_draft
        reason = request.data.get("cancellation_reason", "")
        cancellation_date = request.data.get("cancellation_date")
        instance = service.mark_as_cancelled(
            pk, reason=reason, cancellation_date=cancellation_date
        )
        payload = self.serializer_class(instance, context={"request": request}).data
        message = (
            "Invoice is already cancelled."
            if already_cancelled
            else (
                "Draft service sale deleted. Invoice number has been released."
                if was_draft
                else "Service invoice cancelled."
            )
        )
        return ApiResponse.success(data=payload, message=message)

    def save_invoice_pdf(self, request, pk=None):
        service = self.get_service()
        sale = service.get(pk)
        business = self.get_active_business()
        if sale.business_id != business.id:
            return ApiResponse.error(
                message="Service sale not found.",
                status_code=status.HTTP_404_NOT_FOUND,
            )

        upload = request.FILES.get("file")
        if not upload:
            return ApiResponse.error(
                message="PDF file is required.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        if sale.invoice_pdf:
            sale.invoice_pdf.delete(save=False)
        sale.invoice_pdf.save("service-sale-%s.pdf" % sale.pk, upload, save=True)
        url = request.build_absolute_uri(sale.invoice_pdf.url)
        return ApiResponse.success(
            data={"url": url},
            message="Service sale invoice PDF saved.",
        )

    def destroy(self, request, pk=None):
        return ApiResponse.error(
            message="Service sale delete is not supported.",
            status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        )
