from django.conf import settings
from django.db.models import Exists, OuterRef, Q

from apps.user_roles.models import UserRole
from apps.users.models import User

ADMIN_ROLE_NAMES = ("Super Admin", "Admin", "superadmin")


def business_owner_users_queryset():
    """Business owners visible in the superadmin user list (non-admin accounts)."""
    business_owner_assignment = UserRole.objects.filter(
        user_id=OuterRef("pk"),
        is_deleted=False,
        role__is_deleted=False,
        role__role_name__iexact="Business Owner",
    )

    admin_roles = Q()
    for role_name in ADMIN_ROLE_NAMES:
        admin_roles |= Q(role__role_name__iexact=role_name)

    admin_assignment = UserRole.objects.filter(
        user_id=OuterRef("pk"),
        is_deleted=False,
        role__is_deleted=False,
    ).filter(admin_roles)

    queryset = User.objects.filter(Exists(business_owner_assignment)).exclude(
        Exists(admin_assignment)
    )

    excluded_emails = [
        email.strip().lower()
        for email in getattr(settings, "USER_MANAGEMENT_EXCLUDED_EMAILS", [])
        if email and email.strip()
    ]
    if excluded_emails:
        queryset = queryset.exclude(email__in=excluded_emails)

    return queryset
