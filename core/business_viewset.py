from core.business_scope import get_owned_business


class BusinessScopedViewSetMixin:
    """Filter inventory data by the business selected in the request header."""

    def get_active_business(self):
        if not hasattr(self, "_active_business"):
            self._active_business = get_owned_business(self.request)
        return self._active_business

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)
        return queryset.filter(business_id=self.get_active_business().id)

    def inject_business_scope(self, data):
        business = self.get_active_business()
        data["business_id"] = business.id
        data["owner_id"] = business.owner_id
        return data
