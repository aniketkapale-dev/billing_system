"""
Root URL configuration for Billing System.
"""
from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path

from apps.page_views import (
    inventory_login,
    inventory_register,
    landing,
    superadmin_dashboard,
    superadmin_users,
    user_dashboard,
    user_inventory,
    user_products,
    user_purchases,
    user_stock_in,
    user_business,
)

urlpatterns = [
    path("", landing, name="landing"),
    path("login/", inventory_login, name="inventory-login"),
    path("register/", inventory_register, name="inventory-register"),
    path("superadmin/dashboard/", superadmin_dashboard, name="superadmin-dashboard"),
    path("superadmin/users/", superadmin_users, name="superadmin-users"),
    path("dashboard/", user_dashboard, name="user-dashboard"),
    path("dashboard/products/", user_products, name="user-products"),
    path("dashboard/inventory/", user_inventory, name="user-inventory"),
    path("dashboard/stock-in/", user_stock_in, name="user-stock-in"),
    path("dashboard/purchases/", user_purchases, name="user-purchases"),
    path("dashboard/business/", user_business, name="user-business"),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/users/", include("apps.users.urls")),
    path("api/businesses/", include("apps.businesses.urls")),
    path("api/catalog/", include("apps.catalog.urls")),
    path("api/products/", include("apps.products.urls")),
    path("api/inventory/", include("apps.inventory.urls")),
    path("api/invoicing/", include("apps.invoicing.urls")),
    path("api/purchases/", include("apps.purchases.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
