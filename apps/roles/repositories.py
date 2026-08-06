from apps.roles.models import Role
from core.base_repository import BaseRepository


class RoleRepository(BaseRepository):
    model = Role
