from django.urls import path

from apps.business_users.views import BusinessRoleViewSet, BusinessUserMetaViewSet, BusinessUserViewSet

urlpatterns = [
    path(
        "roles/",
        BusinessRoleViewSet.as_view({"get": "list", "post": "create"}),
        name="business-role-list",
    ),
    path(
        "tabs/",
        BusinessUserMetaViewSet.as_view({"get": "tabs"}),
        name="business-user-tabs",
    ),
    path(
        "my-access/",
        BusinessUserMetaViewSet.as_view({"get": "my_access"}),
        name="business-user-my-access",
    ),
    path(
        "",
        BusinessUserViewSet.as_view({"get": "list", "post": "create"}),
        name="business-user-list",
    ),
    path(
        "<int:pk>/",
        BusinessUserViewSet.as_view({
            "patch": "partial_update",
            "delete": "destroy",
        }),
        name="business-user-detail",
    ),
]
