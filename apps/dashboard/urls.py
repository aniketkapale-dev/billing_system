from django.urls import path

from apps.dashboard.views import DashboardStatsView, SuperAdminDashboardStatsView

urlpatterns = [
    path("stats/", DashboardStatsView.as_view(), name="dashboard-stats"),
    path(
        "superadmin-stats/",
        SuperAdminDashboardStatsView.as_view(),
        name="superadmin-dashboard-stats",
    ),
]
