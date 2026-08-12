from apps.settings.models import InvoiceSetting, Tax
from core.base_repository import BaseRepository


class TaxRepository(BaseRepository):
    model = Tax

    def get_queryset(self):
        return super().get_queryset().select_related("business")


class InvoiceSettingRepository(BaseRepository):
    model = InvoiceSetting

    def get_queryset(self):
        return super().get_queryset().select_related("business")
