from apps.catalog.models import Brand, Category, Manufacturer, PaymentType, Unit, Vendor
from core.base_repository import BaseRepository


class UnitRepository(BaseRepository):
    model = Unit

    def get_queryset(self):
        return super().get_queryset().select_related("business")


class CategoryRepository(BaseRepository):
    model = Category

    def get_queryset(self):
        return super().get_queryset().select_related("business")


class BrandRepository(BaseRepository):
    model = Brand

    def get_queryset(self):
        return super().get_queryset().select_related("business")


class ManufacturerRepository(BaseRepository):
    model = Manufacturer

    def get_queryset(self):
        return super().get_queryset().select_related("business")


class PaymentTypeRepository(BaseRepository):
    model = PaymentType

    def get_queryset(self):
        return super().get_queryset().select_related("business")


class VendorRepository(BaseRepository):
    model = Vendor

    def get_queryset(self):
        return super().get_queryset().select_related("business")
