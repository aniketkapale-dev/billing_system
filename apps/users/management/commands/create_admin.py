"""
Creates (or updates) an initial admin user for the panel.

Usage:
    python manage.py create_admin --email admin@example.com --password Admin@123 \
        --name "Super Admin" --mobile 9999999999
"""
from django.core.management.base import BaseCommand

from apps.roles.models import Role
from apps.user_roles.models import UserRole
from apps.users.models import User


class Command(BaseCommand):
    help = "Create or update an initial admin user."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--password", required=True)
        parser.add_argument("--name", default="Administrator")
        parser.add_argument("--mobile", default="0000000000")

    def handle(self, *args, **options):
        email = options["email"].strip().lower()
        user, created = User.all_objects.get_or_create(
            email=email,
            defaults={
                "full_name": options["name"],
                "mobile_number": options["mobile"],
            },
        )
        user.full_name = options["name"]
        user.mobile_number = options["mobile"]
        user.is_active = True
        user.is_deleted = False
        user.set_password(options["password"])
        user.save()

        role, _ = Role.objects.get_or_create(
            role_name="Super Admin",
            defaults={"description": "Full administrative access"},
        )
        UserRole.objects.get_or_create(user=user, role=role)

        business_owner = Role.objects.filter(role_name__iexact="Business Owner").first()
        if business_owner:
            for assignment in UserRole.objects.filter(
                user=user, role=business_owner, is_deleted=False
            ):
                assignment.soft_delete()

        action = "Created" if created else "Updated"
        self.stdout.write(self.style.SUCCESS(f"{action} admin user: {email}"))
