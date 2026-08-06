"""
Reusable validators used by serializers and services.
"""
import re

from core.exceptions import ValidationException

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MOBILE_RE = re.compile(r"^[0-9]{7,15}$")


def validate_email_format(value):
    if not value or not EMAIL_RE.match(value):
        raise ValidationException("Enter a valid email address.")
    return value


def validate_mobile_number(value):
    cleaned = str(value).replace(" ", "").replace("-", "")
    if not MOBILE_RE.match(cleaned):
        raise ValidationException("Enter a valid mobile number (7-15 digits).")
    return cleaned


def validate_required(value, field_name="Field"):
    if value in (None, "", []):
        raise ValidationException(f"{field_name} is required.")
    return value


def ensure_unique(repository, field, value, exclude_pk=None):
    """Raises if another non-deleted record already uses `value` for `field`."""
    qs = repository.model.objects.filter(**{field: value})
    if exclude_pk is not None:
        qs = qs.exclude(pk=exclude_pk)
    if qs.exists():
        raise ValidationException(f"A record with this {field} already exists.")
    return value
