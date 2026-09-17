from core.business_access import resolve_business_access, user_has_tab


class BusinessScopedViewSetMixin:
    """Filter inventory data by the business selected in the request header."""

    required_tab = None
    read_access_tabs = ()

    def get_active_business(self):
        if not hasattr(self, "_active_business"):
            self._active_business, self._business_access = resolve_business_access(self.request)
            required_tab = getattr(self, "required_tab", None)
            read_access_tabs = getattr(self, "read_access_tabs", ()) or ()
            action = getattr(self, "action", None)
            allowed_tabs = []
            if required_tab:
                allowed_tabs.append(required_tab)
            if action in {"list", "retrieve"} and read_access_tabs:
                allowed_tabs.extend(read_access_tabs)
            if allowed_tabs and not any(
                user_has_tab(self._business_access, tab) for tab in allowed_tabs
            ):
                from rest_framework.exceptions import PermissionDenied

                raise PermissionDenied("You do not have access to this section.")
        return self._active_business

    def get_business_access(self):
        if not hasattr(self, "_business_access"):
            self.get_active_business()
        return self._business_access

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)
        return queryset.filter(business_id=self.get_active_business().id)

    def inject_business_scope(self, data):
        business = self.get_active_business()
        data["business_id"] = business.id
        data["owner_id"] = business.owner_id
        return data
