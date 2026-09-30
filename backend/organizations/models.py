import hashlib
import secrets
import uuid
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models
from django.utils import timezone


slug_validator = RegexValidator(
    regex=r"^[a-z][a-z0-9-]{2,62}$",
    message="Use 3-63 lowercase letters, numbers, or hyphens, starting with a letter.",
)


def branding_logo_path(instance, filename):
    extension = filename.rsplit(".", 1)[-1].lower()
    return (
        f"organizations/{instance.organization_id}/branding/"
        f"logo-{uuid.uuid4().hex}.{extension}"
    )


class UUIDTimeStampedModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Organization(UUIDTimeStampedModel):
    class Status(models.TextChoices):
        TRIAL = "trial", "Trial"
        ACTIVE = "active", "Active"
        GRACE = "grace", "Read-only grace"
        SUSPENDED = "suspended", "Suspended"
        CANCELLED = "cancelled", "Cancelled"
        PURGING = "purging", "Scheduled for purge"

    slug = models.SlugField(max_length=63, unique=True, validators=[slug_validator])
    name = models.CharField(max_length=180)
    legal_name = models.CharField(max_length=220, blank=True)
    industry_code = models.CharField(max_length=40, default="commerce")
    job_cards_enabled = models.BooleanField(default=False)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.TRIAL
    )
    timezone = models.CharField(max_length=64, default="Africa/Lagos")
    currency = models.CharField(max_length=3, default="NGN")
    locale = models.CharField(max_length=16, default="en-NG")
    onboarding_completed_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    purge_after = models.DateTimeField(null=True, blank=True)

    RESERVED_SLUGS = {
        "www", "api", "admin", "control", "auth", "support", "status",
        "static", "media",
    }

    def clean(self):
        if self.slug in self.RESERVED_SLUGS:
            raise ValidationError({"slug": "This tenant address is reserved."})

    def __str__(self):
        return self.name


class OrganizationOwnedModel(UUIDTimeStampedModel):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)

    class Meta:
        abstract = True


class Location(OrganizationOwnedModel):
    class Kind(models.TextChoices):
        STORE = "store", "Store"
        BRANCH = "branch", "Branch"
        OFFICE = "office", "Office"
        WAREHOUSE = "warehouse", "Warehouse"
        CAMPUS = "campus", "Campus"
        FARM = "farm", "Farm"

    name = models.CharField(max_length=180)
    code = models.CharField(max_length=24)
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.STORE)
    timezone = models.CharField(max_length=64, default="Africa/Lagos")
    address = models.JSONField(default=dict, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    email = models.EmailField(blank=True)
    is_primary = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "code"], name="unique_location_code_per_org"
            )
        ]
        ordering = ["name"]

    def __str__(self):
        return f"{self.organization.name} · {self.name}"


class LocationOwnedModel(OrganizationOwnedModel):
    location = models.ForeignKey(Location, on_delete=models.CASCADE)

    class Meta:
        abstract = True

    def clean(self):
        if self.location_id and self.organization_id:
            if self.location.organization_id != self.organization_id:
                raise ValidationError("Location must belong to the organization.")


class TenantDomain(OrganizationOwnedModel):
    class Kind(models.TextChoices):
        SUBDOMAIN = "subdomain", "Platform subdomain"
        CUSTOM = "custom", "Custom domain"

    domain = models.CharField(max_length=253, unique=True)
    kind = models.CharField(
        max_length=16, choices=Kind.choices, default=Kind.SUBDOMAIN
    )
    is_primary = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    verification_token = models.CharField(max_length=80, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.domain


class BrandingProfile(OrganizationOwnedModel):
    display_name = models.CharField(max_length=180)
    logo = models.FileField(upload_to=branding_logo_path, blank=True)
    logo_url = models.URLField(blank=True)
    favicon_url = models.URLField(blank=True)
    primary_color = models.CharField(max_length=7, default="#2563EB")
    accent_color = models.CharField(max_length=7, default="#10B981")
    receipt_header = models.CharField(max_length=220, blank=True)
    receipt_footer = models.TextField(blank=True)
    terminology = models.JSONField(default=dict, blank=True)
    document_prefixes = models.JSONField(default=dict, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization"], name="one_branding_profile_per_org"
            )
        ]


class ModuleDefinition(UUIDTimeStampedModel):
    code = models.SlugField(max_length=50, unique=True)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    version = models.CharField(max_length=20, default="1.0")
    dependencies = models.JSONField(default=list, blank=True)
    navigation = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class TenantModule(OrganizationOwnedModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        READ_ONLY = "read_only", "Read only"
        DISABLED = "disabled", "Disabled"

    module = models.ForeignKey(ModuleDefinition, on_delete=models.PROTECT)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.ACTIVE
    )
    config = models.JSONField(default=dict, blank=True)
    activated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="activated_modules",
    )
    activated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "module"], name="unique_module_per_org"
            )
        ]


class Capability(UUIDTimeStampedModel):
    code = models.CharField(max_length=80, unique=True)
    name = models.CharField(max_length=120)
    module_code = models.CharField(max_length=50, default="platform")
    description = models.TextField(blank=True)

    def __str__(self):
        return self.code


class Role(OrganizationOwnedModel):
    name = models.CharField(max_length=80)
    code = models.SlugField(max_length=50)
    description = models.TextField(blank=True)
    is_system = models.BooleanField(default=False)
    capabilities = models.ManyToManyField(Capability, through="RoleCapability")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "code"], name="unique_role_code_per_org"
            )
        ]

    def __str__(self):
        return f"{self.organization.slug}:{self.name}"


class RoleCapability(OrganizationOwnedModel):
    role = models.ForeignKey(Role, on_delete=models.CASCADE)
    capability = models.ForeignKey(Capability, on_delete=models.CASCADE)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["role", "capability"], name="unique_capability_per_role"
            )
        ]


class Membership(OrganizationOwnedModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INVITED = "invited", "Invited"
        SUSPENDED = "suspended", "Suspended"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="memberships"
    )
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.ACTIVE
    )
    title = models.CharField(max_length=120, blank=True)
    is_owner = models.BooleanField(default=False)
    joined_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "user"], name="unique_user_membership_per_org"
            )
        ]

    def __str__(self):
        return f"{self.user} @ {self.organization}"


class RoleAssignment(OrganizationOwnedModel):
    membership = models.ForeignKey(
        Membership, on_delete=models.CASCADE, related_name="role_assignments"
    )
    role = models.ForeignKey(Role, on_delete=models.PROTECT)
    location = models.ForeignKey(
        Location, null=True, blank=True, on_delete=models.CASCADE
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["membership", "role", "location"],
                condition=models.Q(location__isnull=False),
                name="unique_location_role_assignment",
            ),
            models.UniqueConstraint(
                fields=["membership", "role"],
                condition=models.Q(location__isnull=True),
                name="unique_org_role_assignment",
            ),
        ]

    def clean(self):
        org_id = self.membership.organization_id
        if self.role.organization_id != org_id:
            raise ValidationError("Role must belong to the membership organization.")
        if self.location_id and self.location.organization_id != org_id:
            raise ValidationError("Location must belong to the membership organization.")


class Invitation(OrganizationOwnedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        REVOKED = "revoked", "Revoked"
        EXPIRED = "expired", "Expired"

    email = models.EmailField()
    role = models.ForeignKey(Role, on_delete=models.PROTECT)
    locations = models.ManyToManyField(
        Location, through="InvitationLocationScope", blank=True
    )
    token_hash = models.CharField(max_length=64, unique=True)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.PENDING
    )
    expires_at = models.DateTimeField()
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="sent_invitations",
    )
    accepted_at = models.DateTimeField(null=True, blank=True)

    @classmethod
    def create_token(cls):
        raw = secrets.token_urlsafe(32)
        return raw, hashlib.sha256(raw.encode()).hexdigest()

    @classmethod
    def default_expiry(cls):
        return timezone.now() + timedelta(days=3)


class InvitationLocationScope(OrganizationOwnedModel):
    invitation = models.ForeignKey(Invitation, on_delete=models.CASCADE)
    location = models.ForeignKey(Location, on_delete=models.CASCADE)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["invitation", "location"],
                name="unique_invitation_location_scope",
            )
        ]


class CustomFieldDefinition(OrganizationOwnedModel):
    class FieldType(models.TextChoices):
        TEXT = "text", "Text"
        NUMBER = "number", "Number"
        DATE = "date", "Date"
        BOOLEAN = "boolean", "Boolean"
        SELECT = "select", "Select"

    module_code = models.CharField(max_length=50)
    entity_type = models.CharField(max_length=50)
    key = models.SlugField(max_length=50)
    label = models.CharField(max_length=120)
    field_type = models.CharField(max_length=16, choices=FieldType.choices)
    required = models.BooleanField(default=False)
    options = models.JSONField(default=list, blank=True)
    validation = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "module_code", "entity_type", "key"],
                name="unique_custom_field_key",
            )
        ]
