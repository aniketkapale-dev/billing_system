"""
Permanent removal of a business owner and all business-scoped data.

Superadmin "delete user" must hard-delete rows so email/mobile unique constraints
allow re-registration. Soft-deleted users alone still block new sign-ups.
"""
from django.db import transaction
from django.db.models import Q

from apps.businesses.models import Business
from apps.business_users.models import BusinessUser
from apps.catalog.models import Brand, Category, Manufacturer, PaymentType, Unit, Vendor
from apps.customers.models import Customer
from apps.expenses.models import Expense, ExpenseCategory
from apps.inventory.models import InventoryStock, StockMovement
from apps.invoicing.models import (
    BatchConsumption,
    InventoryBatch,
    PurchaseInvoice,
    PurchaseInvoiceItem,
    SalesInvoice,
    SalesInvoiceItem,
)
from apps.products.models import Product
from apps.purchases.models import Purchase, PurchaseItem
from apps.roles.models import Role
from apps.settings.models import InvoiceSetting, Tax
from apps.user_roles.models import UserRole
from apps.users.models import User
from core.exceptions import NotFoundException, ValidationException

ADMIN_ROLE_NAMES = ("Super Admin", "Admin", "superadmin")


def _purge_file_fields(queryset, *field_names):
    for obj in queryset.iterator():
        for name in field_names:
            field_file = getattr(obj, name, None)
            if field_file:
                field_file.delete(save=False)


def purge_business(business):
    business_id = business.id

    BatchConsumption.all_objects.filter(
        Q(inventory_batch__business_id=business_id)
        | Q(purchase_item__purchase__business_id=business_id)
        | Q(sales_invoice_item__sales_invoice__business_id=business_id)
    ).delete()

    StockMovement.all_objects.filter(business_id=business_id).delete()

    PurchaseItem.all_objects.filter(purchase__business_id=business_id).delete()
    Purchase.all_objects.filter(business_id=business_id).delete()

    SalesInvoiceItem.all_objects.filter(sales_invoice__business_id=business_id).delete()
    SalesInvoice.all_objects.filter(business_id=business_id).delete()

    InventoryBatch.all_objects.filter(business_id=business_id).delete()

    PurchaseInvoiceItem.all_objects.filter(purchase_invoice__business_id=business_id).delete()
    purchase_invoices = PurchaseInvoice.all_objects.filter(business_id=business_id)
    _purge_file_fields(purchase_invoices, "attachment")
    purchase_invoices.delete()

    InventoryStock.all_objects.filter(business_id=business_id).delete()

    Expense.all_objects.filter(business_id=business_id).delete()
    ExpenseCategory.all_objects.filter(business_id=business_id).delete()

    Product.all_objects.filter(business_id=business_id).delete()

    Customer.all_objects.filter(business_id=business_id).delete()

    invoice_settings = InvoiceSetting.all_objects.filter(business_id=business_id)
    _purge_file_fields(invoice_settings, "qr_image")
    invoice_settings.delete()

    Tax.all_objects.filter(business_id=business_id).delete()

    for model in (Unit, Category, Brand, Manufacturer, PaymentType, Vendor):
        model.all_objects.filter(business_id=business_id).delete()

    BusinessUser.all_objects.filter(business_id=business_id).delete()
    Role.all_objects.filter(business_id=business_id).delete()

    if business.logo:
        business.logo.delete(save=False)
    business.delete()


def _user_has_admin_role(user):
    admin_roles = Q()
    for role_name in ADMIN_ROLE_NAMES:
        admin_roles |= Q(role__role_name__iexact=role_name)
    return UserRole.all_objects.filter(user=user).filter(admin_roles).exists()


@transaction.atomic
def purge_business_owner_user(user_id):
    user = User.all_objects.filter(pk=user_id).first()
    if not user:
        raise NotFoundException("User not found.")

    if _user_has_admin_role(user):
        raise ValidationException("Admin accounts cannot be permanently deleted from here.")

    for business in list(Business.all_objects.filter(owner=user)):
        purge_business(business)

    InventoryStock.all_objects.filter(owner=user).delete()
    Product.all_objects.filter(owner=user).delete()
    Purchase.all_objects.filter(owner=user).delete()

    UserRole.all_objects.filter(user=user).delete()
    BusinessUser.all_objects.filter(user=user).delete()

    if user.profile_image:
        user.profile_image.delete(save=False)

    user.delete()
    return True
