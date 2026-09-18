from apps.settings.models import (
    InvoiceSetting,
    ProductBarcode,
    Tax,
    WhatsAppMessageLog,
    WhatsAppMessageSetting,
)
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


class WhatsAppMessageSettingRepository(BaseRepository):
    model = WhatsAppMessageSetting

    def get_queryset(self):
        return super().get_queryset().select_related("business")


class WhatsAppMessageLogRepository(BaseRepository):
    model = WhatsAppMessageLog

    def get_queryset(self):
        return super().get_queryset().select_related("business", "customer")
