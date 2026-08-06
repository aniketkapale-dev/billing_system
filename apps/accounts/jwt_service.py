"""
Custom JWT encode/decode. Built on PyJWT directly so the auth layer is fully
independent of Django's auth framework.
"""
from datetime import datetime, timezone

import jwt
from django.conf import settings

from core.exceptions import AuthenticationException


class JWTService:
    ACCESS = "access"
    REFRESH = "refresh"

    @classmethod
    def _build(cls, user_id, token_type, lifetime):
        now = datetime.now(timezone.utc)
        payload = {
            "user_id": user_id,
            "type": token_type,
            "iat": now,
            "exp": now + lifetime,
        }
        return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

    @classmethod
    def generate_tokens(cls, user_id):
        return {
            "access": cls._build(user_id, cls.ACCESS, settings.JWT_ACCESS_LIFETIME),
            "refresh": cls._build(user_id, cls.REFRESH, settings.JWT_REFRESH_LIFETIME),
        }

    @classmethod
    def decode(cls, token, expected_type=None):
        try:
            payload = jwt.decode(
                token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
            )
        except jwt.ExpiredSignatureError as exc:
            raise AuthenticationException("Token has expired.") from exc
        except jwt.InvalidTokenError as exc:
            raise AuthenticationException("Invalid token.") from exc

        if expected_type and payload.get("type") != expected_type:
            raise AuthenticationException("Invalid token type.")
        return payload

    @classmethod
    def refresh_access_token(cls, refresh_token):
        payload = cls.decode(refresh_token, expected_type=cls.REFRESH)
        return cls._build(
            payload["user_id"], cls.ACCESS, settings.JWT_ACCESS_LIFETIME
        )
