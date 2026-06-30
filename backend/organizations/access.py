from django.db.models import Q
from rest_framework.permissions import BasePermission, SAFE_METHODS

from subscriptions.services import (
    subscription_allows_write,
    subscription_entitles_module,
)

from .models import Membership, RoleAssignment, TenantModule


def membership_for(user, organization):
    if not user.is_authenticated or organization is None:
        return None
    return (
        Membership.objects.filter(
            user=user,
            organization=organization,
            status=Membership.Status.ACTIVE,
        )
        .select_related("organization")
        .first()
    )


def effective_capabilities(membership, location=None):
    if membership is None:
        return set()
    if membership.is_owner:
        return {"*"}
    assignments = RoleAssignment.objects.filter(
        organization=membership.organization, membership=membership
    ).filter(
        Q(location__isnull=True) | Q(location=location)
    )
    return set(
        assignments.values_list("role__capabilities__code", flat=True).exclude(
            role__capabilities__code__isnull=True
        )
    )


class TenantAccessPermission(BasePermission):
    message = "You do not have access to this organization."

    def has_permission(self, request, view):
        organization = getattr(request, "organization", None)
        support_session = getattr(request, "support_session", None)
        membership = membership_for(request.user, organization)
        request.membership = membership
        if membership is None and support_session is None:
            return False
        if support_session is not None and (
            request.method == "DELETE" or getattr(view, "deny_support_access", False)
        ):
            self.message = "This action is unavailable during support access."
            return False

        module_code = getattr(view, "module_code", None)
        if module_code:
            if not subscription_entitles_module(organization, module_code):
                self.message = "Your current plan does not include this module."
                return False
            activation = TenantModule.objects.filter(
                organization=organization,
                module__code=module_code,
            ).first()
            if activation is None or activation.status == TenantModule.Status.DISABLED:
                self.message = "This module is not active for your organization."
                return False
            if (
                request.method not in SAFE_METHODS
                and activation.status == TenantModule.Status.READ_ONLY
            ):
                self.message = "This module is currently read-only."
                return False

        if request.method not in SAFE_METHODS and not subscription_allows_write(
            organization
        ):
            self.message = "The organization subscription is read-only."
            return False

        capability = getattr(view, "required_capability", None)
        if capability and support_session is None:
            location = getattr(view, "location", None)
            capabilities = effective_capabilities(membership, location)
            if "*" not in capabilities and capability not in capabilities:
                self.message = "Your assigned role does not allow this action."
                return False
        return True


class OrganizationOwnerPermission(BasePermission):
    message = "Only the organization owner can change company settings."

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        membership = getattr(request, "membership", None)
        return bool(
            membership
            and membership.is_owner
            and getattr(request, "support_session", None) is None
        )
