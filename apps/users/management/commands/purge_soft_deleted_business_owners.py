"""
Remove soft-deleted business owners that still block email/mobile re-registration.

Usage:
  python manage.py purge_soft_deleted_business_owners
  python manage.py purge_soft_deleted_business_owners --email owner@example.com
"""
from django.core.management.base import BaseCommand

from apps.user_roles.models import UserRole
from apps.users.models import User
from apps.users.purge_service import purge_business_owner_user


class Command(BaseCommand):
    help = "Permanently delete soft-deleted business owner users and their data."

    def add_arguments(self, parser):
        parser.add_argument(
            "--email",
            help="Only purge the soft-deleted user with this email.",
        )
        parser.add_argument(
            "--mobile",
            help="Only purge the soft-deleted user with this mobile number.",
        )

    def handle(self, *args, **options):
        email = (options.get("email") or "").strip().lower()
        mobile = (options.get("mobile") or "").strip()

        queryset = User.all_objects.filter(is_deleted=True)
        if email:
            queryset = queryset.filter(email__iexact=email)
        if mobile:
            queryset = queryset.filter(mobile_number=mobile)

        owner_ids = UserRole.all_objects.filter(
            user_id__in=queryset.values("pk"),
            role__role_name__iexact="Business Owner",
        ).values_list("user_id", flat=True).distinct()

        users = User.all_objects.filter(pk__in=owner_ids)
        if not users.exists():
            self.stdout.write(self.style.WARNING("No matching soft-deleted business owners found."))
            return

        count = 0
        for user in users:
            purge_business_owner_user(user.id)
            count += 1
            label = user.email or user.mobile_number or user.id
            self.stdout.write(self.style.SUCCESS(f"Purged user: {label}"))

        self.stdout.write(self.style.SUCCESS(f"Done. Permanently removed {count} user(s)."))
