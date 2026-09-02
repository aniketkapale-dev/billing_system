"""
Server-rendered page shells for the admin panel.

These views only render the HTML scaffold; all data is loaded client-side via
the REST API (JWT in the browser). Page guarding is done in JS (token check),
so these endpoints simply return the templates.
"""
import logging

from django.shortcuts import redirect, render
from django.views.decorators.cache import never_cache

from apps.businesses.models import Business

logger = logging.getLogger(__name__)


def landing(request):
    businesses = list(
        Business.objects.filter(is_active=True, is_deleted=False)
        .exclude(business_name="")
        .order_by("-created_at")[:24]
    )
    return render(request, "landing.html", {"businesses": businesses})


@never_cache
def inventory_login(request):
    return render(request, "inventory/login.html")


def inventory_register(request):
    return render(request, "inventory/register.html")


@never_cache
def superadmin_dashboard(request):
    return render(request, "superadmin/dashboard.html", {"active_nav": "dashboard"})


@never_cache
def superadmin_users(request):
    return render(request, "superadmin/users.html", {"active_nav": "users"})


@never_cache
def user_dashboard(request):
    return render(request, "user/dashboard.html", {"active_nav": "dashboard"})


@never_cache
def user_products(request):
    return render(request, "user/products.html", {"active_nav": "products"})


@never_cache
def user_inventory(request):
    return render(request, "user/inventory.html", {"active_nav": "inventory"})


@never_cache
def user_purchases(request):
    return render(request, "user/purchases.html", {"active_nav": "purchases"})


@never_cache
def user_stock_in(request):
    return render(request, "user/stock-in.html", {"active_nav": "stock-in"})


@never_cache
def user_business(request):
    return render(request, "user/business.html", {"active_nav": "business"})


@never_cache
def user_customers(request):
    return render(request, "user/customers.html", {"active_nav": "customers"})


@never_cache
def user_catalog_units(request):
    return render(request, "user/catalog.html", {
        "active_nav": "products-units",
        "catalog_resource": "units",
        "catalog_title": "Units",
        "catalog_add_label": "Add Unit",
    })


@never_cache
def user_catalog_categories(request):
    return render(request, "user/catalog.html", {
        "active_nav": "products-categories",
        "catalog_resource": "categories",
        "catalog_title": "Categories",
        "catalog_add_label": "Add Category",
    })


@never_cache
def user_catalog_brands(request):
    return render(request, "user/catalog.html", {
        "active_nav": "products-brands",
        "catalog_resource": "brands",
        "catalog_title": "Brands",
        "catalog_add_label": "Add Brand",
    })


@never_cache
def user_settings(request):
    return redirect("user-settings-tax")


@never_cache
def user_settings_tax(request):
    return render(request, "user/settings.html", {
        "active_nav": "settings-tax",
        "settings_section": "tax",
        "settings_title": "Tax",
    })


@never_cache
def user_settings_invoice(request):
    return render(request, "user/settings.html", {
        "active_nav": "settings-invoice",
        "settings_section": "invoice",
        "settings_title": "Invoice",
    })

