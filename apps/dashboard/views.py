from rest_framework.views import APIView

from apps.dashboard.services import DashboardService
from core.base_response import ApiResponse


class DashboardStatsView(APIView):
    def get(self, request):
        stats = DashboardService().get_stats(request=request)
        return ApiResponse.success(data=stats, message="Dashboard stats")
