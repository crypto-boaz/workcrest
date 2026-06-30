from datetime import timedelta

from celery import Task, shared_task
from django.utils import timezone

from audit.models import AuditEvent
from subscriptions.models import Subscription

from .models import Organization
from .tenancy import organization_context


class TenantTask(Task):
    abstract = True

    def __call__(self, *args, **kwargs):
        organization_id = kwargs.get("organization_id")
        if not organization_id:
            raise ValueError("Tenant tasks require organization_id.")
        with organization_context(organization_id):
            return super().__call__(*args, **kwargs)


@shared_task
def transition_subscriptions():
    now = timezone.now()
    transitioned = 0
    for organization_id in Organization.objects.values_list("id", flat=True):
        with organization_context(organization_id):
            subscription = Subscription.objects.filter(
                organization_id=organization_id
            ).first()
            if not subscription:
                continue
            trial_expired = (
                subscription.status == Subscription.Status.TRIALING
                and subscription.trial_ends_at
                and subscription.trial_ends_at <= now
            )
            period_expired = (
                subscription.status == Subscription.Status.ACTIVE
                and subscription.current_period_ends_at
                and subscription.current_period_ends_at <= now
            )
            if trial_expired or period_expired:
                subscription.status = Subscription.Status.GRACE
                subscription.grace_ends_at = now + timedelta(days=7)
                subscription.save(
                    update_fields=["status", "grace_ends_at", "updated_at"]
                )
                Organization.objects.filter(pk=organization_id).update(
                    status=Organization.Status.GRACE
                )
                transitioned += 1
            elif (
                subscription.status == Subscription.Status.GRACE
                and subscription.grace_ends_at
                and subscription.grace_ends_at <= now
            ):
                subscription.status = Subscription.Status.SUSPENDED
                subscription.save(update_fields=["status", "updated_at"])
                Organization.objects.filter(pk=organization_id).update(
                    status=Organization.Status.SUSPENDED
                )
                transitioned += 1
    return transitioned


@shared_task
def purge_cancelled_organizations():
    now = timezone.now()
    organizations = list(
        Organization.objects.filter(
            status__in=[Organization.Status.CANCELLED, Organization.Status.PURGING],
            purge_after__lte=now,
        )
    )
    for organization in organizations:
        with organization_context(organization.id):
            AuditEvent.objects.create(
                organization=organization,
                action="tenant.purged",
                target_type="Organization",
                target_id=str(organization.id),
                metadata={"name": organization.name, "slug": organization.slug},
            )
            organization.delete()
    return len(organizations)
