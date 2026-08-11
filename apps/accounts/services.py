"""
Authentication business logic: login, token refresh, password operations,
current-user profile. Views stay thin and delegate here.
"""
from django.db import transaction

from apps.accounts.jwt_service import JWTService
from apps.roles.models import Role
from apps.user_roles.models import UserRole
from apps.users.models import User
from core.exceptions import AuthenticationException, NotFoundException, ValidationException
from core.validators import ensure_unique, validate_email_format, validate_mobile_number


class AuthService:
    # -- login -------------------------------------------------------------
    def login(self, email, password):
        login_id = (email or "").strip()
        if not login_id or not password:
            raise ValidationException("Email or mobile number and password are required.")

        user = self._find_user_by_login_id(login_id)
        if not user:
            raise AuthenticationException("Invalid email/mobile or password.")

        if not user.is_active:
            raise AuthenticationException(
                "Your registration is complete and waiting for approval. "
                "Please wait till your account is approved."
            )
        if not user.check_password(password):
            raise AuthenticationException("Invalid email/mobile or password.")

        tokens = JWTService.generate_tokens(user.id)
        return {"tokens": tokens, "user": user}

    @staticmethod
    def _find_user_by_login_id(login_id):
        cleaned = login_id.replace(" ", "").replace("-", "")
        if cleaned.isdigit() and len(cleaned) == 10:
            return User.objects.filter(mobile_number=cleaned).first()
        return User.objects.filter(email__iexact=login_id.strip()).first()

    # -- register (business owner, pending admin approval) -----------------
    @transaction.atomic
    def register(self, full_name, email, mobile_number, password):
        email = (email or "").strip()
        if email:
            email = validate_email_format(email).lower()
            if User.objects.filter(email__iexact=email).exists():
                raise ValidationException("An account with this email already exists.")
        else:
            email = None

        mobile_number = validate_mobile_number(mobile_number)
        self._validate_password(password)

        if User.objects.filter(mobile_number=mobile_number).exists():
            raise ValidationException("An account with this mobile number already exists.")

        user = User.objects.create(
            full_name=full_name.strip(),
            email=email,
            mobile_number=mobile_number,
            is_active=False,
        )
        user.set_password(password)
        user.save(update_fields=["password", "updated_at"])

        role, _ = Role.objects.get_or_create(
            role_name="Business Owner",
            defaults={"description": "Business owner account"},
        )
        UserRole.objects.get_or_create(user=user, role=role)

        return {
            "message": (
                "Registration successful. Your account is pending admin approval. "
                "You can sign in with your mobile number and password once approved."
            )
        }

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

    # -- forgot password (no email — SMTP removed) -------------------------
    def forgot_password(self, email):
        return {
            "message": "If the account exists, a reset link was sent."
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
