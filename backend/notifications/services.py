from organizations.models import Membership

from .models import Notification, NotificationRecipient


def notify_organization(
    *,
    organization,
    title,
    body,
    tone=Notification.Tone.INFO,
    href="",
    module_code="platform",
    location=None,
    created_by=None,
):
    notification = Notification.objects.create(
        organization=organization,
        location=location,
        module_code=module_code,
        title=title,
        body=body,
        tone=tone,
        href=href,
        created_by=created_by,
    )
    user_ids = Membership.objects.filter(
        organization=organization,
        status=Membership.Status.ACTIVE,
    ).values_list("user_id", flat=True)
    NotificationRecipient.objects.bulk_create(
        [
            NotificationRecipient(
                organization=organization,
                notification=notification,
                user_id=user_id,
            )
            for user_id in user_ids
        ],
        ignore_conflicts=True,
    )
    return notification
