import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Create or update a platform superuser from environment variables."

    def add_arguments(self, parser):
        parser.add_argument(
            "--email",
            default=os.environ.get("DJANGO_SUPERUSER_EMAIL", ""),
            help="Superuser email address. Defaults to DJANGO_SUPERUSER_EMAIL.",
        )
        parser.add_argument(
            "--password",
            default=os.environ.get("DJANGO_SUPERUSER_PASSWORD", ""),
            help="Superuser password. Defaults to DJANGO_SUPERUSER_PASSWORD.",
        )
        parser.add_argument(
            "--full-name",
            default=os.environ.get("DJANGO_SUPERUSER_FULL_NAME", "Workcrest Owner"),
            help="Superuser full name.",
        )
        parser.add_argument(
            "--noinput",
            action="store_true",
            help="Run non-interactively. Missing credentials skip the command.",
        )

    def handle(self, *args, **options):
        email = (options["email"] or "").strip().lower()
        password = options["password"] or ""
        full_name = (options["full_name"] or "").strip() or "Workcrest Owner"

        if not email or not password:
            message = (
                "DJANGO_SUPERUSER_EMAIL and DJANGO_SUPERUSER_PASSWORD are required "
                "to auto-create the deployment superuser."
            )
            if options["noinput"]:
                self.stdout.write(self.style.WARNING(f"{message} Skipping."))
                return
            raise SystemExit(message)

        User = get_user_model()
        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                "full_name": full_name,
                "is_staff": True,
                "is_superuser": True,
                "is_platform_staff": True,
            },
        )

        changed_fields = []
        for field, value in {
            "full_name": full_name,
            "is_staff": True,
            "is_superuser": True,
            "is_platform_staff": True,
        }.items():
            if getattr(user, field) != value:
                setattr(user, field, value)
                changed_fields.append(field)

        user.set_password(password)
        changed_fields.append("password")
        user.save(update_fields=sorted(set(changed_fields)) if not created else None)

        try:
            from allauth.account.models import EmailAddress
        except Exception:  # pragma: no cover - allauth is installed in normal runtime.
            EmailAddress = None

        if EmailAddress is not None:
            EmailAddress.objects.update_or_create(
                user=user,
                email=email,
                defaults={"verified": True, "primary": True},
            )
            EmailAddress.objects.filter(user=user).exclude(email=email).update(
                primary=False
            )

        action = "Created" if created else "Updated"
        self.stdout.write(self.style.SUCCESS(f"{action} deployment superuser {email}."))
