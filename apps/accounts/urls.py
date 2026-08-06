from django.urls import path

from apps.accounts.views import AuthViewSet

urlpatterns = [
    path("login/", AuthViewSet.as_view({"post": "login"}), name="login"),
    path("logout/", AuthViewSet.as_view({"post": "logout"}), name="logout"),
    path("refresh/", AuthViewSet.as_view({"post": "refresh"}), name="refresh"),
    path("forgot-password/", AuthViewSet.as_view({"post": "forgot_password"}), name="forgot-password"),
    path("reset-password/", AuthViewSet.as_view({"post": "reset_password"}), name="reset-password"),
    path("change-password/", AuthViewSet.as_view({"post": "change_password"}), name="change-password"),
    path("me/", AuthViewSet.as_view({"get": "me"}), name="me"),
]
