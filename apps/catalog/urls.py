from django.urls import path

from apps.catalog.views import BrandViewSet, CategoryViewSet, ManufacturerViewSet, UnitViewSet

urlpatterns = [
    path("units/", UnitViewSet.as_view({"get": "list", "post": "create"}), name="unit-list"),
    path(
        "units/<int:pk>/",
        UnitViewSet.as_view({
            "get": "retrieve",
            "put": "update",
            "patch": "partial_update",
            "delete": "destroy",
        }),
        name="unit-detail",
    ),
    path(
        "units/<int:pk>/restore/",
        UnitViewSet.as_view({"post": "restore"}),
        name="unit-restore",
    ),
    path(
        "categories/",
        CategoryViewSet.as_view({"get": "list", "post": "create"}),
        name="category-list",
    ),
    path(
        "categories/<int:pk>/",
        CategoryViewSet.as_view({
            "get": "retrieve",
            "put": "update",
            "patch": "partial_update",
            "delete": "destroy",
        }),
        name="category-detail",
    ),
    path(
        "categories/<int:pk>/restore/",
        CategoryViewSet.as_view({"post": "restore"}),
        name="category-restore",
    ),
    path("brands/", BrandViewSet.as_view({"get": "list", "post": "create"}), name="brand-list"),
    path(
        "brands/<int:pk>/",
        BrandViewSet.as_view({
            "get": "retrieve",
            "put": "update",
            "patch": "partial_update",
            "delete": "destroy",
        }),
        name="brand-detail",
    ),
    path(
        "brands/<int:pk>/restore/",
        BrandViewSet.as_view({"post": "restore"}),
        name="brand-restore",
    ),
    path(
        "manufacturers/",
        ManufacturerViewSet.as_view({"get": "list", "post": "create"}),
        name="manufacturer-list",
    ),
    path(
        "manufacturers/<int:pk>/",
        ManufacturerViewSet.as_view({
            "get": "retrieve",
            "put": "update",
            "patch": "partial_update",
            "delete": "destroy",
        }),
        name="manufacturer-detail",
    ),
    path(
        "manufacturers/<int:pk>/restore/",
        ManufacturerViewSet.as_view({"post": "restore"}),
        name="manufacturer-restore",
    ),
]
