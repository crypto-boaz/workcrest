from io import StringIO

import pytest
from allauth.account.models import EmailAddress
from django.contrib.auth import get_user_model
from django.core.management import call_command


pytestmark = pytest.mark.django_db


def test_ensure_superuser_creates_verified_platform_owner():
    output = StringIO()

    call_command(
        "ensure_superuser",
        email="pelumialiu8@gmail.com",
        password="test-password-123",
        full_name="Workcrest Owner",
        stdout=output,
    )

    User = get_user_model()
    user = User.objects.get(email="pelumialiu8@gmail.com")

    assert user.check_password("test-password-123")
    assert user.is_staff is True
    assert user.is_superuser is True
    assert user.is_platform_staff is True
    assert user.full_name == "Workcrest Owner"
    assert EmailAddress.objects.get(user=user, email=user.email).verified is True
    assert "Created deployment superuser" in output.getvalue()


def test_ensure_superuser_noinput_skips_when_credentials_missing():
    output = StringIO()

    call_command("ensure_superuser", noinput=True, stdout=output)

    assert "Skipping" in output.getvalue()
