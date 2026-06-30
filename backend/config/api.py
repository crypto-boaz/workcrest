from rest_framework.views import exception_handler as drf_exception_handler


def exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        return response

    request = context.get("request")
    request_id = getattr(request, "request_id", None)
    detail = response.data

    if isinstance(detail, dict) and set(detail.keys()) == {"detail"}:
        message = str(detail["detail"])
        field_errors = {}
    else:
        message = "The request could not be completed."
        field_errors = detail if isinstance(detail, dict) else {}

    response.data = {
        "code": getattr(exc, "default_code", "request_error"),
        "message": message,
        "field_errors": field_errors,
        "request_id": request_id,
    }
    return response
