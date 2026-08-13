from rest_framework.views import APIView

from apps.dashboard.services import DashboardService
from core.base_response import ApiResponse
from core.permissions import HasRole, IsAuthenticatedUser


class DashboardStatsView(APIView):
    required_roles = ["Business Owner", "Business Staff"]
    permission_classes = [IsAuthenticatedUser, HasRole]

    def get(self, request):
        stats = DashboardService().get_stats(request=request)
        return ApiResponse.success(data=stats, message="Dashboard stats")
