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
)

urlpatterns = [
    path("", landing, name="landing"),
    path("login/", inventory_login, name="inventory-login"),
    path("register/", inventory_register, name="inventory-register"),
    path("superadmin/dashboard/", superadmin_dashboard, name="superadmin-dashboard"),
    path("superadmin/users/", superadmin_users, name="superadmin-users"),
    path("dashboard/", user_dashboard, name="user-dashboard"),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/users/", include("apps.users.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
