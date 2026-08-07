from apps.catalog.models import Brand, Category, Unit
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
