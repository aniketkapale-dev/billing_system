from django.urls import path

from apps.settings.views import InvoiceSettingViewSet, TaxViewSet

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
]
