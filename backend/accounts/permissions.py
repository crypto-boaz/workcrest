from allauth.account.internal.flows.reauthentication import (
    did_recently_authenticate,
)
from rest_framework.permissions import BasePermission, SAFE_METHODS


class RecentAuthenticationRequired(BasePermission):
    message = "Please reauthenticate before making this sensitive change."

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return did_recently_authenticate(request)


class PlatformOwnerOnly(BasePermission):
    message = "Only admin access."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_superuser)
