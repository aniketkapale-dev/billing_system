from django.urls import path

from apps.inventory.views import InventoryStockViewSet

urlpatterns = [
    path(
        "profit-summary/",
        InventoryStockViewSet.as_view({"get": "profit_summary"}),
        name="inventory-profit-summary",
    ),
    path("", InventoryStockViewSet.as_view({"get": "list"}), name="inventory-stock-list"),
    path(
        "<int:pk>/",
        InventoryStockViewSet.as_view({"get": "retrieve"}),
        name="inventory-stock-detail",
    ),
]
