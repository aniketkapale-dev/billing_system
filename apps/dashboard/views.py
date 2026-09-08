from rest_framework.views import APIView

from apps.dashboard.services import DashboardService, SuperAdminDashboardService
from core.base_response import ApiResponse
from core.permissions import HasRole, IsAuthenticatedUser


class DashboardStatsView(APIView):
    required_roles = ["Business Owner", "Business Staff"]
    permission_classes = [IsAuthenticatedUser, HasRole]

    def get(self, request):
        stats = DashboardService().get_stats(request=request)
        return ApiResponse.success(data=stats, message="Dashboard stats")


class DashboardSalesChartView(APIView):
    required_roles = ["Business Owner", "Business Staff"]
    permission_classes = [IsAuthenticatedUser, HasRole]

    def get(self, request):
        period = request.query_params.get("period", "week")
        data = DashboardService().get_sales_chart(request=request, period=period)
        return ApiResponse.success(data=data, message="Sales chart data")


class DashboardPendingPaymentsView(APIView):
    required_roles = ["Business Owner", "Business Staff"]
    permission_classes = [IsAuthenticatedUser, HasRole]

    def get(self, request):
        period = request.query_params.get("period", "week")
        data = DashboardService().get_pending_payments(request=request, period=period)
        return ApiResponse.success(data=data, message="Pending payments")


class DashboardKpiCountsView(APIView):
    required_roles = ["Business Owner", "Business Staff"]
    permission_classes = [IsAuthenticatedUser, HasRole]

    def get(self, request):
        purchases_period = request.query_params.get("purchases_period", "week")
        sales_period = request.query_params.get("sales_period", "week")
        data = DashboardService().get_kpi_counts(
            request=request,
            purchases_period=purchases_period,
            sales_period=sales_period,
        )
        return ApiResponse.success(data=data, message="Dashboard KPI counts")


class DashboardExpiringProductsView(APIView):
    required_roles = ["Business Owner", "Business Staff"]
    permission_classes = [IsAuthenticatedUser, HasRole]

    def get(self, request):
        period = request.query_params.get("period", "week")
        data = DashboardService().get_expiring_products(request=request, period=period)
        return ApiResponse.success(data=data, message="Expiring products")


class SuperAdminDashboardStatsView(APIView):
    required_roles = ["Super Admin"]
    permission_classes = [IsAuthenticatedUser, HasRole]

    def get(self, request):
        stats = SuperAdminDashboardService().get_stats()
        return ApiResponse.success(data=stats, message="Super admin dashboard stats")
