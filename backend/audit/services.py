from .models import AuditEvent, OutboxEvent


def record_audit(
    *,
    organization,
    action,
    actor=None,
    location=None,
    target=None,
    request=None,
    metadata=None,
):
    return AuditEvent.objects.create(
        organization=organization,
        location=location,
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        support_session_id=(
            getattr(getattr(request, "support_session", None), "id", None)
            if request
            else None
        ),
        action=action,
        target_type=target.__class__.__name__ if target else "",
        target_id=str(getattr(target, "pk", "")) if target else "",
        request_id=getattr(request, "request_id", "") if request else "",
        ip_address=_client_ip(request) if request else None,
        metadata=metadata or {},
    )


def publish_later(*, organization, topic, payload):
    return OutboxEvent.objects.create(
        organization=organization,
        topic=topic,
        payload=payload,
    )


def _client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")
