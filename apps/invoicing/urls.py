from django.urls import path

from apps.invoicing.views import InventoryBatchViewSet, PurchaseInvoiceViewSet

urlpatterns = [
    path(
        "purchase-invoices/",
        PurchaseInvoiceViewSet.as_view({"get": "list", "post": "create"}),
        name="purchase-invoice-list",
    ),
    path(
        "purchase-invoices/<int:pk>/",
        PurchaseInvoiceViewSet.as_view({"get": "retrieve"}),
        name="purchase-invoice-detail",
    ),
    path(
        "batches/",
        InventoryBatchViewSet.as_view({"get": "list"}),
        name="inventory-batch-list",
    ),
    path(
        "batches/<int:pk>/",
        InventoryBatchViewSet.as_view({"get": "retrieve"}),
        name="inventory-batch-detail",
    ),
]
