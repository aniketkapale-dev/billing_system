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
    user_customers,
    user_catalog_units,
    user_catalog_categories,
    user_catalog_brands,
    user_settings,
    user_settings_tax,
    user_settings_invoice,
)

urlpatterns = [
    path("", landing, name="landing"),
    path("login/", inventory_login, name="inventory-login"),
    path("register/", inventory_register, name="inventory-register"),
    path("superadmin/dashboard/", superadmin_dashboard, name="superadmin-dashboard"),
    path("superadmin/users/", superadmin_users, name="superadmin-users"),
    path("dashboard/", user_dashboard, name="user-dashboard"),
    path("dashboard/products/", user_products, name="user-products"),
    path("dashboard/units/", user_catalog_units, name="user-catalog-units"),
    path("dashboard/categories/", user_catalog_categories, name="user-catalog-categories"),
    path("dashboard/brands/", user_catalog_brands, name="user-catalog-brands"),
    path("dashboard/inventory/", user_inventory, name="user-inventory"),
    path("dashboard/stock-in/", user_stock_in, name="user-stock-in"),
    path("dashboard/purchases/", user_purchases, name="user-purchases"),
    path("dashboard/customers/", user_customers, name="user-customers"),
    path("dashboard/business/", user_business, name="user-business"),
    path("dashboard/settings/", user_settings, name="user-settings"),
    path("dashboard/settings/tax/", user_settings_tax, name="user-settings-tax"),
    path("dashboard/settings/invoice/", user_settings_invoice, name="user-settings-invoice"),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/users/", include("apps.users.urls")),
    path("api/businesses/", include("apps.businesses.urls")),
    path("api/catalog/", include("apps.catalog.urls")),
    path("api/dashboard/", include("apps.dashboard.urls")),
    path("api/products/", include("apps.products.urls")),
    path("api/inventory/", include("apps.inventory.urls")),
    path("api/invoicing/", include("apps.invoicing.urls")),
    path("api/purchases/", include("apps.purchases.urls")),
    path("api/customers/", include("apps.customers.urls")),
    path("api/settings/", include("apps.settings.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
