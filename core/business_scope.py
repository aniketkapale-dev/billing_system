"""
Resolve and validate the active business for inventory management APIs.
"""
from apps.businesses.models import Business
from core.exceptions import NotFoundException, ValidationException


def parse_business_id(request):
    raw = request.headers.get("X-Business-Id") or request.query_params.get("business_id")
    if raw in (None, ""):
        raise ValidationException("Select a business to continue.")
    try:
        business_id = int(raw)
    except (TypeError, ValueError) as exc:
        raise ValidationException("Invalid business id.") from exc
    if business_id <= 0:
        raise ValidationException("Invalid business id.")
    return business_id


def get_owned_business(request):
    user = getattr(request, "user", None)
    if not (user and user.is_authenticated):
        raise ValidationException("Authentication required.")

    business_id = parse_business_id(request)
    try:
        return Business.objects.get(
            pk=business_id,
            owner_id=user.id,
            is_deleted=False,
        )
    except Business.DoesNotExist as exc:
        raise NotFoundException("Business not found.") from exc
