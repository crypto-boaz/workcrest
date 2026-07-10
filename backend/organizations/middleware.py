from django.conf import settings
from django.utils import timezone

from .models import Membership, Organization, TenantDomain
from .tenancy import organization_context


class TenantResolutionMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.organization = self.resolve_organization(request)
        return self.get_response(request)

    def resolve_organization(self, request):
        forwarded_host = request.META.get("HTTP_X_FORWARDED_HOST", "")
        raw_host = forwarded_host.split(",")[0].strip() or request.get_host()
        hostname = raw_host.split(":")[0].lower()
        if settings.DEBUG:
            requested_slug = request.headers.get(
                "X-Tenant-Slug"
            ) or request.session.get("debug_tenant_slug")
            if not requested_slug and hostname.endswith(".localhost"):
                requested_slug = hostname.removesuffix(".localhost")
            if requested_slug:
                return Organization.objects.filter(slug=requested_slug).first()
            if (
                hostname in {"localhost", "127.0.0.1", "testserver"}
                and request.user.is_authenticated
            ):
                membership = (
                    Membership.objects.filter(
                        user=request.user,
                        status=Membership.Status.ACTIVE,
                    )
                    .select_related("organization")
                    .order_by("joined_at")
                    .first()
                )
                if membership:
                    return membership.organization

        domain = (
            TenantDomain.objects.select_related("organization")
            .filter(domain=hostname, is_active=True, verified_at__isnull=False)
            .first()
        )
        if domain:
            return domain.organization

        suffix = f".{settings.PLATFORM_DOMAIN}".lower()
        if hostname.endswith(suffix):
            slug = hostname[: -len(suffix)]
            return Organization.objects.filter(slug=slug).first()

        if settings.SINGLE_HOST_TENANCY and request.user.is_authenticated:
            active_slug = request.session.get("active_tenant_slug")
            candidates = []
            if active_slug:
                session_organization = Organization.objects.filter(
                    slug=active_slug
                ).first()
                if session_organization:
                    candidates.append(session_organization)
            if request.user.active_organization_id:
                user_organization = Organization.objects.filter(
                    id=request.user.active_organization_id
                ).first()
                if user_organization and all(
                    candidate.id != user_organization.id
                    for candidate in candidates
                ):
                    candidates.append(user_organization)

            for organization in candidates:
                with organization_context(organization.id):
                    has_access = Membership.objects.filter(
                        organization=organization,
                        user=request.user,
                        status=Membership.Status.ACTIVE,
                    ).exists()
                if not has_access:
                    continue

                request.session["active_tenant_slug"] = organization.slug
                if request.user.active_organization_id != organization.id:
                    request.user.active_organization_id = organization.id
                    request.user.save(
                        update_fields=["active_organization_id"]
                    )
                return organization

            if active_slug:
                request.session.pop("active_tenant_slug", None)
            return None
        return None


class SupportSessionMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.support_session = None
        session_id = request.headers.get("X-Support-Session") or request.session.get(
            "support_session_id"
        )
        if (
            session_id
            and request.user.is_authenticated
            and request.user.is_staff
            and request.organization is not None
        ):
            from platform_admin.models import SupportSession
            from .tenancy import organization_context

            with organization_context(request.organization.id):
                request.support_session = (
                    SupportSession.objects.filter(
                        id=session_id,
                        platform_user=request.user,
                        organization=request.organization,
                        ended_at__isnull=True,
                        expires_at__gt=timezone.now(),
                    )
                    .select_related("organization")
                    .first()
                )
        return self.get_response(request)
