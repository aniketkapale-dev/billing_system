from decimal import Decimal

from apps.settings.repositories import InvoiceSettingRepository, TaxRepository
from core.base_service import BaseService
from core.exceptions import ValidationException
from core.middleware import get_current_user
from core.validators import validate_required


class TaxService(BaseService):
    def __init__(self):
        super().__init__(repository=TaxRepository())

    def before_create(self, data):
        user = get_current_user()
        if not user:
            raise ValidationException("Authentication required.")
        data.pop("owner_id", None)
        business_id = data.get("business_id")
        if not business_id:
            raise ValidationException("Business is required.")
        self._validate(data)

    def before_update(self, instance, data):
        data.pop("owner_id", None)
        data.pop("business_id", None)
        self._validate(data, exclude_pk=instance.pk, business_id=instance.business_id)

    def _validate(self, data, exclude_pk=None, business_id=None):
        if "key" in data:
            validate_required(data["key"], "Tax key")

        scoped_business_id = business_id or data.get("business_id")
        key = data.get("key")
        if key:
            qs = self.repository.model.objects.filter(
                business_id=scoped_business_id,
                key=key,
                is_deleted=False,
            )
            if exclude_pk:
                qs = qs.exclude(pk=exclude_pk)
            if qs.exists():
                raise ValidationException("A tax with this key already exists.")

        if "value" in data:
            value = data["value"]
            if value is None or value == "":
                raise ValidationException("Tax value is required.")
            try:
                numeric = Decimal(str(value))
            except Exception as exc:
                raise ValidationException("Tax value must be a number.") from exc
            if numeric < 0 or numeric > 100:
                raise ValidationException("Tax value must be between 0 and 100.")
            data["value"] = numeric


class InvoiceSettingService(BaseService):
    def __init__(self):
        super().__init__(repository=InvoiceSettingRepository())

    def before_create(self, data):
        user = get_current_user()
        if not user:
            raise ValidationException("Authentication required.")
        data.pop("owner_id", None)
        business_id = data.get("business_id")
        if not business_id:
            raise ValidationException("Business is required.")

        counter = data.get("counter")
        if counter is None or counter == "":
            counter = 1
        data["counter"] = int(counter)
        data["current_counter"] = data["counter"]
        self._validate(data)

    def before_update(self, instance, data):
        data.pop("owner_id", None)
        data.pop("business_id", None)
        self._validate(data, exclude_pk=instance.pk, business_id=instance.business_id, instance=instance)

    def _validate(self, data, exclude_pk=None, business_id=None, instance=None):
        scoped_business_id = business_id or data.get("business_id")

        if "year" in data:
            year = data.get("year")
            if year is None or year == "":
                raise ValidationException("Year is required.")
            try:
                year = int(year)
            except (TypeError, ValueError) as exc:
                raise ValidationException("Year must be a valid number.") from exc
            if year < 2000 or year > 2100:
                raise ValidationException("Year must be between 2000 and 2100.")
            data["year"] = year

        resolved_year = data.get("year") if "year" in data else (instance.year if instance else None)
        if resolved_year is not None:
            if "prefix" in data:
                resolved_prefix = str(data.get("prefix") or "").strip()
                data["prefix"] = resolved_prefix
            else:
                resolved_prefix = (instance.prefix if instance else "") or ""

            if "suffix" in data:
                resolved_suffix = str(data.get("suffix") or "").strip()
                data["suffix"] = resolved_suffix
            else:
                resolved_suffix = (instance.suffix if instance else "") or ""

            qs = self.repository.model.objects.filter(
                business_id=scoped_business_id,
                year=resolved_year,
                prefix=resolved_prefix,
                suffix=resolved_suffix,
                is_deleted=False,
            )
            if exclude_pk:
                qs = qs.exclude(pk=exclude_pk)
            if qs.exists():
                raise ValidationException(
                    "Invoice settings with this year, prefix, and suffix already exist."
                )

        for field in ("counter", "current_counter"):
            if field in data:
                value = data[field]
                if value is None or value == "":
                    label = "Start counter" if field == "counter" else "Current counter"
                    raise ValidationException(f"{label} is required.")
                try:
                    numeric = int(value)
                except (TypeError, ValueError) as exc:
                    label = "Start counter" if field == "counter" else "Current counter"
                    raise ValidationException(f"{label} must be a whole number.") from exc
                if numeric < 0:
                    label = "Start counter" if field == "counter" else "Current counter"
                    raise ValidationException(f"{label} cannot be negative.")
                data[field] = numeric
