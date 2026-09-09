from django.urls import path

from apps.settings.views import InvoiceSettingViewSet, ProductBarcodeViewSet, TaxViewSet

urlpatterns = [
    path("taxes/", TaxViewSet.as_view({"get": "list", "post": "create"}), name="tax-list"),
    path(
        "taxes/<int:pk>/",
        TaxViewSet.as_view({
            "get": "retrieve",
            "put": "update",
            "patch": "partial_update",
            "delete": "destroy",
        }),
        name="tax-detail",
    ),
    path(
        "taxes/<int:pk>/restore/",
        TaxViewSet.as_view({"post": "restore"}),
        name="tax-restore",
    ),
    path(
        "invoice-settings/",
        InvoiceSettingViewSet.as_view({"get": "list", "post": "create"}),
        name="invoice-setting-list",
    ),
    path(
        "invoice-settings/<int:pk>/",
        InvoiceSettingViewSet.as_view({
            "get": "retrieve",
            "put": "update",
            "patch": "partial_update",
            "delete": "destroy",
        }),
        name="invoice-setting-detail",
    ),
    path(
        "invoice-settings/<int:pk>/restore/",
        InvoiceSettingViewSet.as_view({"post": "restore"}),
        name="invoice-setting-restore",
    ),
    path(
        "barcodes/",
        ProductBarcodeViewSet.as_view({"get": "list", "post": "create"}),
        name="product-barcode-list",
    ),
    path(
        "barcodes/bulk-generate/",
        ProductBarcodeViewSet.as_view({"post": "bulk_generate"}),
        name="product-barcode-bulk-generate",
    ),
    path(
        "barcodes/<int:pk>/",
        ProductBarcodeViewSet.as_view({
            "get": "retrieve",
            "put": "update",
            "patch": "partial_update",
            "delete": "destroy",
        }),
        name="product-barcode-detail",
    ),
    path(
        "barcodes/<int:pk>/restore/",
        ProductBarcodeViewSet.as_view({"post": "restore"}),
        name="product-barcode-restore",
    ),
]
