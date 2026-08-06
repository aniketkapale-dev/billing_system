"""
Custom exceptions + DRF exception handler that funnels every error through the
standard ApiResponse envelope.
"""
from core.base_response import ApiResponse


class AppException(Exception):
    """Base class for domain/business exceptions raised inside services."""

    message = "Application error"
    status_code = 400

    def __init__(self, message=None, errors=None, status_code=None):
        self.message = message or self.message
        self.errors = errors or []
        if status_code is not None:
            self.status_code = status_code
        super().__init__(self.message)


class NotFoundException(AppException):
    message = "Record not found"
    status_code = 404


class ValidationException(AppException):
    message = "Validation failed"
    status_code = 400


class AuthenticationException(AppException):
    message = "Authentication failed"
    status_code = 401


def custom_exception_handler(exc, context):
    # Domain exceptions raised by the service layer.
    if isinstance(exc, AppException):
        return ApiResponse.error(
            message=exc.message,
            errors=exc.errors,
            status_code=exc.status_code,
        )

    # Let DRF build its standard response, then reshape it.
    from rest_framework.views import exception_handler

    response = exception_handler(exc, context)
    if response is None:
        return ApiResponse.error(
            message="Internal server error",
            errors=[str(exc)],
            status_code=500,
        )

    detail = response.data
    errors = []
    message = "Request failed"

    if isinstance(detail, dict):
        if "detail" in detail:
            message = str(detail["detail"])
        else:
            for field, msgs in detail.items():
                if isinstance(msgs, (list, tuple)):
                    errors.extend(f"{field}: {m}" for m in msgs)
                else:
                    errors.append(f"{field}: {msgs}")
            message = "Validation failed"
    elif isinstance(detail, list):
        errors = [str(d) for d in detail]

    return ApiResponse.error(
        message=message,
        errors=errors,
        status_code=response.status_code,
    )
