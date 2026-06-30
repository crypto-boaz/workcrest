from .models import Subscription


def get_subscription(organization):
    if organization is None:
        return None
    return (
        Subscription.objects.select_related("plan")
        .filter(organization=organization)
        .first()
    )


def subscription_allows_write(organization):
    subscription = get_subscription(organization)
    return bool(subscription and subscription.allows_write)


def subscription_entitles_module(organization, module_code):
    subscription = get_subscription(organization)
    if subscription is None:
        return False
    return subscription.plan.modules.filter(
        code=module_code, is_active=True
    ).exists()


def entitlement_snapshot(organization):
    subscription = get_subscription(organization)
    if subscription is None:
        return {
            "plan": None,
            "status": "unconfigured",
            "limits": {},
            "features": [],
            "allows_write": False,
        }
    return {
        "plan": subscription.plan.code,
        "status": subscription.status,
        "limits": subscription.effective_limits,
        "features": subscription.plan.features,
        "allows_write": subscription.allows_write,
        "trial_ends_at": subscription.trial_ends_at,
        "period_ends_at": subscription.current_period_ends_at,
        "grace_ends_at": subscription.grace_ends_at,
    }
