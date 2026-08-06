from apps.user_roles.models import UserRole
from core.base_repository import BaseRepository


class UserRoleRepository(BaseRepository):
    model = UserRole

    def get_queryset(self):
        return super().get_queryset().select_related("user", "role")
