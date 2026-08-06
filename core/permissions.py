"""
Permissions for the admin panel. Since we use a custom user model, we provide
a simple authenticated check plus an optional role-based gate.
"""
from rest_framework.permissions import BasePermission


class IsAuthenticatedUser(BasePermission):
    message = "Authentication credentials were not provided or are invalid."

    def has_permission(self, request, view):
        return bool(getattr(request, "user", None) and request.user.is_authenticated)


class HasRole(BasePermission):
    """Allows access only to users holding one of `required_roles` on the view."""

    message = "You do not have the required role to perform this action."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not (user and user.is_authenticated):
            return False
        required = getattr(view, "required_roles", None)
        if not required:
            return True
        user_roles = set(
            user.user_roles.filter(is_deleted=False).values_list(
                "role__role_name", flat=True
            )
        )
        return bool(user_roles.intersection(set(required)))
