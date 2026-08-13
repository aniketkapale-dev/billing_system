from apps.business_users.models import BusinessUser
from core.base_repository import BaseRepository


class BusinessUserRepository(BaseRepository):
    model = BusinessUser
