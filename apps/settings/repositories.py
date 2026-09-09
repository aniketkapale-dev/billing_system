from apps.settings.models import InvoiceSetting, ProductBarcode, Tax
from core.base_repository import BaseRepository


class TaxRepository(BaseRepository):
    model = Tax

    def get_queryset(self):
        return super().get_queryset().select_related("business")


class InvoiceSettingRepository(BaseRepository):
    model = InvoiceSetting

    def get_queryset(self):
        return super().get_queryset().select_related("business")


class ProductBarcodeRepository(BaseRepository):
    model = ProductBarcode

    def get_queryset(self):
        return super().get_queryset().select_related("business", "product")
