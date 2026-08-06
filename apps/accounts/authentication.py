"""
DRF authentication class that validates our custom JWT access tokens and
resolves the matching custom User instance.
"""
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from apps.accounts.jwt_service import JWTService
from apps.users.models import User
from core.exceptions import AuthenticationException


class JWTAuthentication(BaseAuthentication):
    keyword = "Bearer"

    def authenticate(self, request):
        header = request.headers.get("Authorization", "")
        if not header.startswith(f"{self.keyword} "):
            return None  # no credentials -> allow other auth / anonymous handling

        token = header.split(" ", 1)[1].strip()
        try:
            payload = JWTService.decode(token, expected_type=JWTService.ACCESS)
        except AuthenticationException as exc:
            raise AuthenticationFailed(str(exc))

        try:
            user = User.objects.get(pk=payload["user_id"], is_active=True)
        except User.DoesNotExist:
            raise AuthenticationFailed("User not found or inactive.")

        return (user, token)

    def authenticate_header(self, request):
        return self.keyword
