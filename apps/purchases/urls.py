from django.urls import path

from apps.purchases.views import PurchaseViewSet, SaleDueSettingView, ServiceSaleViewSet

urlpatterns = [
    path("due-settings/", SaleDueSettingView.as_view(), name="purchase-due-settings"),
    path(
        "service-sales/",
        ServiceSaleViewSet.as_view({"get": "list", "post": "create"}),
        name="service-sale-list",
    ),
    path(
        "service-sales/<int:pk>/",
        ServiceSaleViewSet.as_view({"get": "retrieve", "patch": "partial_update"}),
        name="service-sale-detail",
    ),
    path(
        "service-sales/<int:pk>/finalize/",
        ServiceSaleViewSet.as_view({"post": "finalize"}),
        name="service-sale-finalize",
    ),
    path(
        "service-sales/<int:pk>/mark-paid/",
        ServiceSaleViewSet.as_view({"post": "mark_paid"}),
        name="service-sale-mark-paid",
    ),
    path(
        "service-sales/<int:pk>/payments/",
        ServiceSaleViewSet.as_view({"get": "list_payments", "post": "record_payment"}),
        name="service-sale-payments",
    ),
    path(
        "service-sales/<int:pk>/mark-cancelled/",
        ServiceSaleViewSet.as_view({"post": "mark_cancelled"}),
        name="service-sale-mark-cancelled",
    ),
    path(
        "service-sales/<int:pk>/invoice-pdf/",
        ServiceSaleViewSet.as_view({"post": "save_invoice_pdf"}),
        name="service-sale-invoice-pdf",
    ),
    path("", PurchaseViewSet.as_view({"get": "list", "post": "create"}), name="purchase-list"),
    path(
        "<int:pk>/",
        PurchaseViewSet.as_view({"get": "retrieve", "patch": "partial_update"}),
        name="purchase-detail",
    ),
    path(
        "<int:pk>/finalize/",
        PurchaseViewSet.as_view({"post": "finalize"}),
        name="purchase-finalize",
    ),
    path(
        "<int:pk>/mark-paid/",
        PurchaseViewSet.as_view({"post": "mark_paid"}),
        name="purchase-mark-paid",
    ),
    path(
        "<int:pk>/payments/",
        PurchaseViewSet.as_view({"get": "list_payments", "post": "record_payment"}),
        name="purchase-payments",
    ),
    path(
        "<int:pk>/mark-cancelled/",
        PurchaseViewSet.as_view({"post": "mark_cancelled"}),
        name="purchase-mark-cancelled",
    ),
    path(
        "<int:pk>/invoice-pdf/",
        PurchaseViewSet.as_view({"post": "save_invoice_pdf"}),
        name="purchase-invoice-pdf",
    ),
]
