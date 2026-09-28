import uuid
from time import perf_counter


class RequestIDMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        started = perf_counter()
        request.request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        response = self.get_response(request)
        response["X-Request-ID"] = request.request_id
        if request.path.startswith("/api/"):
            response["Server-Timing"] = f'app;dur={(perf_counter() - started) * 1000:.1f}'
        return response
