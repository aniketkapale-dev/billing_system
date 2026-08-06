"""
Uniform API response envelope.

Every endpoint returns:
{
    "isSuccess": true,
    "message": "Success",
    "data": {},
    "errors": []
}
"""
from rest_framework import status
from rest_framework.response import Response


class ApiResponse:
    @staticmethod
    def success(data=None, message="Success", status_code=status.HTTP_200_OK):
        return Response(
            {
                "isSuccess": True,
                "message": message,
                "data": data if data is not None else {},
                "errors": [],
            },
            status=status_code,
        )

    @staticmethod
    def error(message="Something went wrong", errors=None,
              status_code=status.HTTP_400_BAD_REQUEST):
        return Response(
            {
                "isSuccess": False,
                "message": message,
                "data": {},
                "errors": errors if errors is not None else [],
            },
            status=status_code,
        )
