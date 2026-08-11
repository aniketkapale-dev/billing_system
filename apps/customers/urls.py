from django.urls import path

from apps.customers.views import CustomerViewSet

urlpatterns = [
    path("", CustomerViewSet.as_view({"get": "list", "post": "create"}), name="customer-list"),
    path(
        "<int:pk>/",
        CustomerViewSet.as_view({
            "get": "retrieve",
            "put": "update",
            "patch": "partial_update",
            "delete": "destroy",
        }),
        name="customer-detail",
    ),
    path(
        "<int:pk>/restore/",
        CustomerViewSet.as_view({"post": "restore"}),
        name="customer-restore",
    ),
]
