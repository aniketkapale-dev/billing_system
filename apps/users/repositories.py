from apps.users.models import User
from core.base_repository import BaseRepository


class UserRepository(BaseRepository):
    model = User

    def get_queryset(self):
        return super().get_queryset().prefetch_related("user_roles__role")

    def find_by_email(self, email):
        return self.find_one(email__iexact=email)
