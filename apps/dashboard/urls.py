from django.urls import path

from apps.dashboard.views import (
    DashboardExpiringProductsView,
    DashboardKpiCountsView,
    DashboardPendingPaymentsView,
    DashboardSalesChartView,
    DashboardStatsView,
    SuperAdminDashboardStatsView,
)

urlpatterns = [
    path("stats/", DashboardStatsView.as_view(), name="dashboard-stats"),
    path("sales-chart/", DashboardSalesChartView.as_view(), name="dashboard-sales-chart"),
    path(
        "pending-payments/",
        DashboardPendingPaymentsView.as_view(),
        name="dashboard-pending-payments",
    ),
    path(
        "expiring-products/",
        DashboardExpiringProductsView.as_view(),
        name="dashboard-expiring-products",
    ),
    path(
        "kpi-counts/",
        DashboardKpiCountsView.as_view(),
        name="dashboard-kpi-counts",
    ),
    path(
        "superadmin-stats/",
        SuperAdminDashboardStatsView.as_view(),
        name="superadmin-dashboard-stats",
    ),
]
