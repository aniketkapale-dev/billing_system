"""
Authentication business logic: login, token refresh, password operations,
current-user profile. Views stay thin and delegate here.
"""
from django.db import transaction

from apps.accounts.jwt_service import JWTService
from apps.users.models import User
from core.exceptions import AuthenticationException, NotFoundException, ValidationException

from django.conf import settings
from apps.email_templates.services.email_service import EmailService


class AuthService:
    # -- login -------------------------------------------------------------
    def login(self, email, password):
        if not email or not password:
            raise ValidationException("Email and password are required.")
        try:
            user = User.objects.get(email__iexact=email.strip())
        except User.DoesNotExist:
            raise AuthenticationException("Invalid email or password.")

        if not user.is_active:
            raise AuthenticationException("This account is inactive.")
        if not user.check_password(password):
            raise AuthenticationException("Invalid email or password.")

        tokens = JWTService.generate_tokens(user.id)
        return {"tokens": tokens, "user": user}

    # -- refresh -----------------------------------------------------------
    def refresh(self, refresh_token):
        if not refresh_token:
            raise ValidationException("Refresh token is required.")
        access = JWTService.refresh_access_token(refresh_token)
        return {"access": access}

    # -- logout ------------------------------------------------------------
    def logout(self, user):
        # Stateless JWT: logout is handled client-side by discarding tokens.
        # Hook left here for a future server-side blacklist if required.
        return True

    # -- forgot password ---------------------------------------------------
    def forgot_password(self, email):
        try:
            user = User.objects.get(email__iexact=(email or "").strip())
        except User.DoesNotExist:
            return {
                "message": "If the account exists, a reset link was sent."
            }

        token = self._reset_token(user.id)

        reset_url = (
            f"{settings.FRONTEND_URL}/reset-password/?token={token}"
        )

        sent = EmailService().send_email(
            recipient_email=user.email,
            template_key="forgot_password",
            first_name=user.full_name,
            last_name="",
            reset_url=reset_url,
        )

        if not sent:
            raise ValidationException(
                "Unable to send password reset email."
            )

        return {
            "message": "Password reset email sent."
        }

    @staticmethod
    def _reset_token(user_id):
        from datetime import datetime, timedelta, timezone

        import jwt
        from django.conf import settings

        now = datetime.now(timezone.utc)
        return jwt.encode(
            {"user_id": user_id, "type": "reset", "iat": now,
             "exp": now + timedelta(minutes=15)},
            settings.JWT_SECRET,
            algorithm=settings.JWT_ALGORITHM,
        )

    @transaction.atomic
    def reset_password(self, reset_token, new_password):
        payload = JWTService.decode(reset_token, expected_type="reset")
        self._validate_password(new_password)
        try:
            user = User.objects.get(pk=payload["user_id"])
        except User.DoesNotExist:
            raise NotFoundException("User not found.")
        user.set_password(new_password)
        user.save(update_fields=["password", "updated_at"])
        return True

    # -- change password ---------------------------------------------------
    @transaction.atomic
    def change_password(self, user, current_password, new_password):
        if not user.check_password(current_password):
            raise ValidationException("Current password is incorrect.")
        self._validate_password(new_password)
        user.set_password(new_password)
        user.save(update_fields=["password", "updated_at"])
        return True

    # -- helpers -----------------------------------------------------------
    @staticmethod
    def _validate_password(password):
        if not password or len(password) < 8:
            raise ValidationException("Password must be at least 8 characters.")
        return password
