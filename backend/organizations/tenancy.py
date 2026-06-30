from contextlib import contextmanager

from django.db import connection, transaction


def activate_organization(organization_id):
    if connection.vendor != "postgresql":
        return
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT set_config('app.current_organization_id', %s, true)",
            [str(organization_id)],
        )


@contextmanager
def organization_context(organization_id):
    with transaction.atomic():
        activate_organization(organization_id)
        yield


class TenantContextMixin:
    organization = None

    def initial(self, request, *args, **kwargs):
        self.organization = getattr(request, "organization", None)
        if self.organization:
            activate_organization(self.organization.id)
        return super().initial(request, *args, **kwargs)
