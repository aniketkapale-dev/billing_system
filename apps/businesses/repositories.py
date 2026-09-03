from apps.businesses.models import Business
from core.base_repository import BaseRepository


class BusinessRepository(BaseRepository):
    model = Business

    def get_queryset(self):
        return super().get_queryset().select_related("owner")
