from types import SimpleNamespace

import pytest
from django.contrib.auth import get_user_model

from organizations.services import provision_organization


@pytest.fixture
def tenant_pair(db, settings):
    settings.DEBUG = True
    User = get_user_model()
    owner_a = User.objects.create_user(
        email="owner-a@example.test",
        password="Strong-Test-Password-1!",
        full_name="Owner A",
    )
    owner_b = User.objects.create_user(
        email="owner-b@example.test",
        password="Strong-Test-Password-2!",
        full_name="Owner B",
    )
    organization_a, location_a = provision_organization(
        owner=owner_a,
        name="Company A",
        slug="company-a",
        location_name="A Main",
    )
    organization_b, location_b = provision_organization(
        owner=owner_b,
        name="Company B",
        slug="company-b",
        location_name="B Main",
    )
    return SimpleNamespace(
        organization_a=organization_a,
        organization_b=organization_b,
        location_a=location_a,
        location_b=location_b,
        owner_a=owner_a,
        owner_b=owner_b,
    )
