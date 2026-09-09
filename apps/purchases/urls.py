from django.urls import path

from apps.purchases.views import PurchaseViewSet

urlpatterns = [
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
]
