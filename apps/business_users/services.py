from django.db import transaction
from django.utils import timezone

from apps.business_users.repositories import BusinessUserRepository
from apps.roles.models import Role
from apps.user_roles.models import UserRole
from apps.users.models import User
from core.base_service import BaseService
from core.exceptions import NotFoundException, ValidationException
from core.middleware import get_current_user
from core.validators import validate_email_format, validate_mobile_number, validate_required


class BusinessUserService(BaseService):
    STAFF_ROLE_NAME = "Business Staff"

    def __init__(self):
        super().__init__(repository=BusinessUserRepository())

    def _ensure_staff_role(self, user):
        role, _ = Role.objects.get_or_create(
            role_name=self.STAFF_ROLE_NAME,
            defaults={"description": "Business staff account"},
        )
        UserRole.objects.get_or_create(user=user, role=role)

    def _get_owned_business(self, business_id):
        user = get_current_user()
        if not user:
            raise ValidationException("Authentication required.")

        from apps.businesses.models import Business

        try:
            return Business.objects.get(
                pk=business_id,
                owner_id=user.id,
                is_deleted=False,
            )
        except Business.DoesNotExist as exc:
            raise NotFoundException("Business not found.") from exc

    def list_for_business(self, business_id):
        self._get_owned_business(business_id)
        return (
            self.repository.model.objects.filter(
                business_id=business_id,
                is_deleted=False,
            )
            .select_related("user", "role")
            .order_by("user__full_name")
        )

    def _resolve_business_role(self, business_id, role_id):
        if not role_id:
            raise ValidationException("Role is required.")
        try:
            return Role.objects.get(
                pk=role_id,
                business_id=business_id,
                is_deleted=False,
            )
        except Role.DoesNotExist as exc:
            raise NotFoundException("Role not found.") from exc

    def list_roles_for_business(self, business_id):
        self._get_owned_business(business_id)
        return Role.objects.filter(
            business_id=business_id,
            is_deleted=False,
        ).order_by("role_name")

    def create_role(self, business_id, data):
        business = self._get_owned_business(business_id)
        role_name = validate_required((data.get("role_name") or "").strip(), "Role name")
        allowed_tabs = data.get("allowed_tabs") or []
        if not allowed_tabs:
            raise ValidationException("Select at least one tab for this role.")

        if Role.objects.filter(
            business_id=business.id,
            role_name__iexact=role_name,
            is_deleted=False,
        ).exists():
            raise ValidationException("A role with this name already exists.")

        return Role.objects.create(
            business_id=business.id,
            role_name=role_name,
            description=(data.get("description") or "").strip(),
            allowed_tabs=allowed_tabs,
        )

    @transaction.atomic
    def create_member(self, business_id, data):
        business = self._get_owned_business(business_id)

        full_name = validate_required((data.get("full_name") or "").strip(), "Full name")
        mobile_number = validate_mobile_number(data.get("mobile_number"))
        email = (data.get("email") or "").strip()
        if email:
            email = validate_email_format(email).lower()
        else:
            email = None

        password = data.get("password") or ""
        if len(password) < 6:
            raise ValidationException("Password must be at least 6 characters.")

        role = self._resolve_business_role(business.id, data.get("role_id"))
        allowed_tabs = role.normalized_allowed_tabs()

        if business.owner.mobile_number == mobile_number:
            raise ValidationException("The business owner cannot be added as a staff user.")

        existing_user = User.objects.filter(mobile_number=mobile_number).first()
        if existing_user:
            if existing_user.id == business.owner_id:
                raise ValidationException("The business owner cannot be added as a staff user.")
            if self.repository.model.objects.filter(
                business_id=business.id,
                user_id=existing_user.id,
                is_deleted=False,
            ).exists():
                raise ValidationException("This user is already assigned to the business.")
            user = existing_user
            user.full_name = full_name
            if email:
                if User.objects.filter(email__iexact=email).exclude(pk=user.id).exists():
                    raise ValidationException("An account with this email already exists.")
                user.email = email
            user.is_active = True
            user.approved_at = user.approved_at or timezone.now()
            user.set_password(password)
            user.save()
        else:
            if email and User.objects.filter(email__iexact=email).exists():
                raise ValidationException("An account with this email already exists.")
            user = User.objects.create(
                full_name=full_name,
                email=email,
                mobile_number=mobile_number,
                is_active=True,
                approved_at=timezone.now(),
            )
            user.set_password(password)
            user.save(update_fields=["password", "updated_at"])

        self._ensure_staff_role(user)

        return self.repository.create(
            business_id=business.id,
            user_id=user.id,
            role_id=role.id,
            allowed_tabs=allowed_tabs,
            is_active=data.get("is_active", True),
        )

    @transaction.atomic
    def update_member(self, pk, business_id, data):
        business = self._get_owned_business(business_id)
        try:
            membership = self.repository.model.objects.select_related("user").get(
                pk=pk,
                business_id=business.id,
                is_deleted=False,
            )
        except self.repository.model.DoesNotExist as exc:
            raise NotFoundException("Business user not found.") from exc

        user = membership.user
        if "full_name" in data and data.get("full_name") is not None:
            user.full_name = validate_required(data["full_name"].strip(), "Full name")
        if "email" in data:
            email = (data.get("email") or "").strip()
            if email:
                email = validate_email_format(email).lower()
                if User.objects.filter(email__iexact=email).exclude(pk=user.id).exists():
                    raise ValidationException("An account with this email already exists.")
                user.email = email
            else:
                user.email = None
        if "mobile_number" in data and data.get("mobile_number") is not None:
            mobile_number = validate_mobile_number(data["mobile_number"])
            if User.objects.filter(mobile_number=mobile_number).exclude(pk=user.id).exists():
                raise ValidationException("An account with this mobile number already exists.")
            user.mobile_number = mobile_number
        if data.get("password"):
            if len(data["password"]) < 6:
                raise ValidationException("Password must be at least 6 characters.")
            user.set_password(data["password"])
        user.save()

        updates = {}
        if "role_id" in data and data.get("role_id") is not None:
            role = self._resolve_business_role(business.id, data["role_id"])
            updates["role_id"] = role.id
            updates["allowed_tabs"] = role.normalized_allowed_tabs()
        if "is_active" in data:
            updates["is_active"] = bool(data["is_active"])

        if updates:
            return self.repository.update(membership, **updates)
        return membership

    def delete_member(self, pk, business_id):
        business = self._get_owned_business(business_id)
        try:
            membership = self.repository.model.objects.get(
                pk=pk,
                business_id=business.id,
                is_deleted=False,
            )
        except self.repository.model.DoesNotExist as exc:
            raise NotFoundException("Business user not found.") from exc
        membership.soft_delete()
        return membership

    @staticmethod
    def list_tab_definitions():
        from apps.business_users.constants import BUSINESS_TAB_DEFINITIONS

        return BUSINESS_TAB_DEFINITIONS

    @staticmethod
    def get_my_access(request):
        from core.business_access import resolve_business_access

        _business, access = resolve_business_access(request)
        return access
