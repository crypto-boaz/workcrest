from django.db import connection
from django.http import JsonResponse


def health_live(request):
    return JsonResponse({"status": "ok"})


def health_ready(request):
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
        cursor.fetchone()
    return JsonResponse({"status": "ready", "database": "ok"})
