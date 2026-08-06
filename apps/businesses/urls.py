from django.urls import path

from apps.businesses.views import BusinessViewSet

urlpatterns = [
    path("", BusinessViewSet.as_view({"get": "list", "post": "create"}), name="business-list"),
    path(
        "<int:pk>/",
        BusinessViewSet.as_view({
            "get": "retrieve",
            "put": "update",
            "patch": "partial_update",
            "delete": "destroy",
        }),
        name="business-detail",
    ),
]
