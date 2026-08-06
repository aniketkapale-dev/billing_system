"""
Captures the current request (user + IP) in thread-local storage so that
BaseEntity audit fields (created_by, updated_ip, ...) can be populated
automatically inside repositories without threading the request everywhere.
"""
import threading

_thread_locals = threading.local()


def get_current_request():
    return getattr(_thread_locals, "request", None)


def get_current_user():
    request = get_current_request()
    user = getattr(request, "user", None)
    # Our custom user is a plain model instance; ignore unauthenticated sentinels.
    return user if getattr(user, "is_authenticated", False) else None


def get_current_ip():
    request = get_current_request()
    if request is None:
        return None
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


class CurrentRequestMiddleware:
    """Stores the active request in thread-local storage for the request scope."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        _thread_locals.request = request
        try:
            response = self.get_response(request)
            response["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response["Pragma"] = "no-cache"
            response["Expires"] = "0"

            return response
        finally:
            _thread_locals.request = None
