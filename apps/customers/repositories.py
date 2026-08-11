from apps.customers.models import Customer
from core.base_repository import BaseRepository


class CustomerRepository(BaseRepository):
    model = Customer

    def get_queryset(self):
        return super().get_queryset().select_related("business")
