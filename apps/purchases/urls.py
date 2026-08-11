from django.urls import path

from apps.purchases.views import PurchaseViewSet

urlpatterns = [
    path("", PurchaseViewSet.as_view({"get": "list", "post": "create"}), name="purchase-list"),
    path(
        "<int:pk>/",
        PurchaseViewSet.as_view({"get": "retrieve", "patch": "partial_update"}),
        name="purchase-detail",
    ),
]
