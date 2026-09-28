from apps.catalog.repositories import (
    BrandRepository,
    CategoryRepository,
    ManufacturerRepository,
    PaymentTypeRepository,
    UnitRepository,
    VendorRepository,
)
from core.base_service import BaseService
from core.exceptions import ValidationException
from core.middleware import get_current_user
from core.validators import validate_required


class UnitService(BaseService):
    def __init__(self):
        super().__init__(repository=UnitRepository())

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
        if "name" in data:
            validate_required(data["name"], "Unit name")
        if "short_name" in data:
            validate_required(data["short_name"], "Unit short name")

        scoped_business_id = business_id or data.get("business_id")
        name = data.get("name")
        if name:
            qs = self.repository.model.objects.filter(
                business_id=scoped_business_id,
                name=name,
                is_deleted=False,
            )
            if exclude_pk:
                qs = qs.exclude(pk=exclude_pk)
            if qs.exists():
                raise ValidationException("A unit with this name already exists.")

        short_name = data.get("short_name")
        if short_name:
            qs = self.repository.model.objects.filter(
                business_id=scoped_business_id,
                short_name=short_name,
                is_deleted=False,
            )
            if exclude_pk:
                qs = qs.exclude(pk=exclude_pk)
            if qs.exists():
                raise ValidationException("A unit with this short name already exists.")


class CategoryService(BaseService):
    def __init__(self):
        super().__init__(repository=CategoryRepository())
        self._sale_tax_ids_to_sync = None

    def before_create(self, data):
        user = get_current_user()
        if not user:
            raise ValidationException("Authentication required.")
        data.pop("owner_id", None)
        business_id = data.get("business_id")
        if not business_id:
            raise ValidationException("Business is required.")
        self._normalize_sale_tax_ids(data, business_id)
        self._validate(data)

    def before_update(self, instance, data):
        data.pop("owner_id", None)
        data.pop("business_id", None)
        self._normalize_sale_tax_ids(data, instance.business_id)
        self._validate(data, exclude_pk=instance.pk, business_id=instance.business_id)
        self._sale_tax_ids_to_sync = data.get("sale_tax_ids") if "sale_tax_ids" in data else None

    def after_update(self, instance):
        if self._sale_tax_ids_to_sync is not None:
            self._sync_products_sale_tax_ids(instance.id, self._sale_tax_ids_to_sync)
            self._sale_tax_ids_to_sync = None

    @staticmethod
    def _sync_products_sale_tax_ids(category_id, sale_tax_ids):
        from apps.products.models import Product

        Product.objects.filter(
            category_id=category_id,
            is_deleted=False,
        ).update(sale_tax_ids=list(sale_tax_ids or []))

    @staticmethod
    def _normalize_sale_tax_ids(data, business_id):
        if "sale_tax_ids" not in data:
            return

        raw = data.get("sale_tax_ids") or []
        tax_ids = []
        for tax_id in raw:
            try:
                tax_ids.append(int(tax_id))
            except (TypeError, ValueError):
                continue

        if not tax_ids:
            data["sale_tax_ids"] = []
            return

        from apps.settings.models import Tax

        taxes = list(
            Tax.objects.filter(
                pk__in=tax_ids,
                business_id=business_id,
                is_deleted=False,
                is_active=True,
            )
        )
        if len(taxes) != len(set(tax_ids)):
            raise ValidationException("One or more selected taxes are not available.")

        order = {pk: idx for idx, pk in enumerate(tax_ids)}
        data["sale_tax_ids"] = [tax.pk for tax in sorted(taxes, key=lambda item: order.get(item.pk, 0))]

    def _validate(self, data, exclude_pk=None, business_id=None):
        if "name" in data:
            validate_required(data["name"], "Category name")

        name = data.get("name")
        if name:
            qs = self.repository.model.objects.filter(
                business_id=business_id or data.get("business_id"),
                name=name,
                is_deleted=False,
            )
            if exclude_pk:
                qs = qs.exclude(pk=exclude_pk)
            if qs.exists():
                raise ValidationException("A category with this name already exists.")


class BrandService(BaseService):
    def __init__(self):
        super().__init__(repository=BrandRepository())

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
        if "name" in data:
            validate_required(data["name"], "Brand name")

        name = data.get("name")
        if name:
            qs = self.repository.model.objects.filter(
                business_id=business_id or data.get("business_id"),
                name=name,
                is_deleted=False,
            )
            if exclude_pk:
                qs = qs.exclude(pk=exclude_pk)
            if qs.exists():
                raise ValidationException("A brand with this name already exists.")


class ManufacturerService(BaseService):
    def __init__(self):
        super().__init__(repository=ManufacturerRepository())

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
        if "name" in data:
            validate_required(data["name"], "Manufacturer name")

        name = data.get("name")
        if name:
            qs = self.repository.model.objects.filter(
                business_id=business_id or data.get("business_id"),
                name=name,
                is_deleted=False,
            )
            if exclude_pk:
                qs = qs.exclude(pk=exclude_pk)
            if qs.exists():
                raise ValidationException("A manufacturer with this name already exists.")


class PaymentTypeService(BaseService):
    def __init__(self):
        super().__init__(repository=PaymentTypeRepository())

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
        if "name" in data:
            validate_required(data["name"], "Payment type name")

        name = data.get("name")
        if name:
            qs = self.repository.model.objects.filter(
                business_id=business_id or data.get("business_id"),
                name=name,
                is_deleted=False,
            )
            if exclude_pk:
                qs = qs.exclude(pk=exclude_pk)
            if qs.exists():
                raise ValidationException("A payment type with this name already exists.")


class VendorService(BaseService):
    def __init__(self):
        super().__init__(repository=VendorRepository())

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
        if "name" in data:
            validate_required(data["name"], "Vendor name")

        name = data.get("name")
        if name:
            qs = self.repository.model.objects.filter(
                business_id=business_id or data.get("business_id"),
                name=name,
                is_deleted=False,
            )
            if exclude_pk:
                qs = qs.exclude(pk=exclude_pk)
            if qs.exists():
                raise ValidationException("A vendor with this name already exists.")
