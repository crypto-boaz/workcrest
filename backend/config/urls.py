from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

from .views import health_live, health_ready


urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", health_live, name="health"),
    path("ready/", health_ready, name="readiness"),
    path("api/v1/auth/", include("allauth.headless.urls")),
    path("api/v1/", include("organizations.urls")),
    path("api/v1/notifications/", include("notifications.urls")),
    path("api/v1/exports/", include("audit.urls")),
    path(
        "api/v1/locations/<uuid:location_id>/",
        include("commerce.urls"),
    ),
    path("api/v1/platform/", include("platform_admin.urls")),
    path("api/v1/schema/", SpectacularAPIView.as_view(), name="api-schema"),
    path(
        "api/v1/docs/",
        SpectacularSwaggerView.as_view(url_name="api-schema"),
        name="api-docs",
    ),
    path(
        "api/v1/redoc/",
        SpectacularRedocView.as_view(url_name="api-schema"),
        name="api-redoc",
    ),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
