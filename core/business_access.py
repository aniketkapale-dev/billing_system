"""
Resolve business access for owners and invited business users.
"""
from apps.business_users.constants import ALL_BUSINESS_TAB_CODES, OWNER_ONLY_TAB_CODES
from apps.business_users.models import BusinessUser
from apps.businesses.models import Business
from core.business_scope import parse_business_id
from core.exceptions import NotFoundException, ValidationException


def resolve_business_access(request):
    user = getattr(request, "user", None)
    if not (user and user.is_authenticated):
        raise ValidationException("Authentication required.")

    business_id = parse_business_id(request)
    business = Business.objects.filter(pk=business_id, is_deleted=False).select_related("owner").first()
    if not business:
        raise NotFoundException("Business not found.")

    if business.owner_id == user.id:
        return business, {
            "is_owner": True,
            "allowed_tabs": list(ALL_BUSINESS_TAB_CODES) + sorted(OWNER_ONLY_TAB_CODES),
        }

    membership = (
        BusinessUser.objects.filter(
            business_id=business_id,
            user_id=user.id,
            is_deleted=False,
            is_active=True,
        )
        .select_related("user", "role")
        .first()
    )
    if membership:
        return business, {
            "is_owner": False,
            "allowed_tabs": membership.normalized_allowed_tabs(),
            "membership_id": membership.id,
        }

    raise NotFoundException("Business not found.")


def get_active_business(request):
    business, _access = resolve_business_access(request)
    return business


def require_business_owner(request):
    business, access = resolve_business_access(request)
    if not access["is_owner"]:
        raise NotFoundException("Business not found.")
    return business, access


def user_has_tab(access, tab_code):
    if access.get("is_owner"):
        return True
    return tab_code in (access.get("allowed_tabs") or [])
