from django.urls import path

from apps.products.views import ProductViewSet

urlpatterns = [
    path("", ProductViewSet.as_view({"get": "list", "post": "create"}), name="product-list"),
    path(
        "<int:pk>/",
        ProductViewSet.as_view({
            "get": "retrieve",
            "put": "update",
            "patch": "partial_update",
            "delete": "destroy",
        }),
        name="product-detail",
    ),
]
