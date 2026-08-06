from django.urls import path

from apps.inventory.views import InventoryStockViewSet

urlpatterns = [
    path("", InventoryStockViewSet.as_view({"get": "list"}), name="inventory-stock-list"),
    path(
        "<int:pk>/",
        InventoryStockViewSet.as_view({"get": "retrieve"}),
        name="inventory-stock-detail",
    ),
]
