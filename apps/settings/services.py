import random
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.products.models import Product
from apps.settings.models import ProductBarcode

from apps.settings.repositories import (
    InvoiceSettingRepository,
    ProductBarcodeRepository,
    TaxRepository,
)
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
        data.pop("clear_qr", None)
        business_id = data.get("business_id")
        if not business_id:
            raise ValidationException("Business is required.")

        if "terms_conditions" in data:
            data["terms_conditions"] = str(data.get("terms_conditions") or "").strip()

        counter = data.get("counter")
        if counter is None or counter == "":
            counter = 1
        data["counter"] = int(counter)
        data["current_counter"] = data["counter"]
        self._validate(data)

    def before_update(self, instance, data):
        data.pop("owner_id", None)
        data.pop("business_id", None)
        if data.pop("clear_qr", False):
            if instance.qr_image:
                instance.qr_image.delete(save=False)
            data["qr_image"] = None
        if "terms_conditions" in data:
            data["terms_conditions"] = str(data.get("terms_conditions") or "").strip()
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

    @staticmethod
    def _shift_end_counter_date(end_counter):
        if not end_counter:
            return None
        try:
            return end_counter.replace(year=end_counter.year + 1)
        except ValueError:
            return end_counter.replace(year=end_counter.year + 1, day=28)

    def resolve_for_sale(self, setting):
        from django.db import IntegrityError
        from django.utils import timezone

        from apps.settings.models import InvoiceSetting

        today = timezone.localdate()
        if setting.is_usable_on(today):
            return setting

        next_year = setting.year + 1
        if next_year > 2100:
            raise ValidationException("Invoice series cannot roll over beyond year 2100.")

        prefix = (setting.prefix or "").strip()
        suffix = (setting.suffix or "").strip()
        next_end_counter = self._shift_end_counter_date(setting.end_counter)

        lookup = {
            "business_id": setting.business_id,
            "year": next_year,
            "prefix": prefix,
            "suffix": suffix,
            "is_deleted": False,
        }

        successor = InvoiceSetting.objects.select_for_update().filter(**lookup).first()
        if successor:
            successor.current_counter = successor.counter
            successor.save(update_fields=["current_counter", "updated_at"])
            return successor

        try:
            return InvoiceSetting.objects.create(
                business_id=setting.business_id,
                year=next_year,
                prefix=prefix,
                suffix=suffix,
                counter=setting.counter,
                current_counter=setting.counter,
                end_counter=next_end_counter,
            )
        except IntegrityError:
            successor = InvoiceSetting.objects.select_for_update().filter(**lookup).first()
            if not successor:
                raise
            successor.current_counter = successor.counter
            successor.save(update_fields=["current_counter", "updated_at"])
            return successor


class ProductBarcodeService(BaseService):
    def __init__(self):
        super().__init__(repository=ProductBarcodeRepository())

    def before_create(self, data):
        user = get_current_user()
        if not user:
            raise ValidationException("Authentication required.")
        data.pop("owner_id", None)
        business_id = data.get("business_id")
        if not business_id:
            raise ValidationException("Business is required.")
        if "product_id" in data:
            self._apply_product(data, business_id)
        self._validate(data)

    def before_update(self, instance, data):
        data.pop("owner_id", None)
        data.pop("business_id", None)
        if "product_id" in data:
            self._apply_product(data, instance.business_id)
            new_product_id = data.get("product_id")
            if instance.product_id and new_product_id and instance.product_id != new_product_id:
                raise ValidationException("This barcode is already assigned to a product.")
        self._validate(data, exclude_pk=instance.pk, business_id=instance.business_id)

    def _apply_product(self, data, business_id):
        product_id = data.pop("product_id", None)
        if not product_id:
            data["product_id"] = None
            return

        product = Product.objects.filter(
            pk=product_id,
            business_id=business_id,
            is_deleted=False,
        ).first()
        if not product:
            raise ValidationException("Product not found.")
        data["product_id"] = product.id

    def _validate(self, data, exclude_pk=None, business_id=None):
        value = data.get("value")
        if value is not None:
            value = str(value).strip()
            if not value:
                raise ValidationException("Barcode value is required.")
            data["value"] = value

        scoped_business_id = business_id or data.get("business_id")
        if value and scoped_business_id:
            qs = self.repository.model.objects.filter(
                business_id=scoped_business_id,
                value=value,
                is_deleted=False,
            )
            if exclude_pk:
                qs = qs.exclude(pk=exclude_pk)
            if qs.exists():
                raise ValidationException("This barcode value already exists.")

        if "model_label" in data:
            data["model_label"] = str(data.get("model_label") or "").strip()

    def bulk_generate(self, data):
        user = get_current_user()
        if not user:
            raise ValidationException("Authentication required.")

        business_id = data.get("business_id")
        if not business_id:
            raise ValidationException("Business is required.")

        product_id = data.get("product_id")
        quantity = data.get("quantity")

        product = Product.objects.filter(
            pk=product_id,
            business_id=business_id,
            is_deleted=False,
        ).first()
        if not product:
            raise ValidationException("Product not found.")

        sku = (product.sku or "").strip()
        if not sku:
            raise ValidationException("Product SKU is required.")

        try:
            quantity = int(round(float(quantity)))
        except (TypeError, ValueError):
            raise ValidationException("Quantity must be a whole number.")
        if quantity < 1 or quantity > 500:
            raise ValidationException("Quantity must be between 1 and 500.")

        date_stamp = timezone.localdate().strftime("%Y%m%d")
        prefix = date_stamp

        suffixes = self._allocate_unique_suffixes(prefix, business_id, quantity)
        created = []

        with transaction.atomic():
            for suffix in suffixes:
                value = f"{prefix}{suffix}"
                instance = self.repository.create(
                    business_id=business_id,
                    product_id=product.id,
                    value=value,
                    model_label=sku,
                    is_active=True,
                )
                created.append(instance)

        return created

    def _collect_used_suffixes(self, prefix, business_id):
        """Return RAND4 suffixes already used for this model+date prefix."""
        used = set()
        suffix_len = 4
        expected_len = len(prefix) + suffix_len

        values = ProductBarcode.objects.filter(
            business_id=business_id,
            is_deleted=False,
            value__startswith=prefix,
        ).values_list("value", flat=True)

        for value in values:
            if len(value) == expected_len:
                used.add(value[len(prefix):])

        return used

    def _allocate_unique_suffixes(self, prefix, business_id, quantity):
        """Pick unique random 4-digit suffixes not yet used for this prefix."""
        used = self._collect_used_suffixes(prefix, business_id)
        remaining = 10000 - len(used)
        if quantity > remaining:
            raise ValidationException(
                f"Cannot generate {quantity} unique barcodes for this date. "
                f"Only {remaining} unique suffixes remain."
            )

        available = [f"{i:04d}" for i in range(10000) if f"{i:04d}" not in used]
        random.shuffle(available)
        return available[:quantity]
