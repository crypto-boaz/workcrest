from django.contrib.auth import get_user_model
from pathlib import Path
import re
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field

from .models import (
    BrandingProfile,
    Capability,
    CustomFieldDefinition,
    Invitation,
    InvitationLocationScope,
    Location,
    Membership,
    ModuleDefinition,
    Organization,
    Role,
    RoleAssignment,
    RoleCapability,
    TenantModule,
)
from .services import provision_organization


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = [
            "id",
            "slug",
            "name",
            "legal_name",
            "industry_code",
            "status",
            "timezone",
            "currency",
            "locale",
        ]
        read_only_fields = ["id", "status"]


class LocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Location
        fields = [
            "id",
            "name",
            "code",
            "kind",
            "timezone",
            "address",
            "phone",
            "email",
            "is_primary",
            "is_active",
        ]
        read_only_fields = ["id"]


class BrandingSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = BrandingProfile
        fields = [
            "display_name",
            "logo_url",
            "favicon_url",
            "primary_color",
            "accent_color",
            "receipt_header",
            "receipt_footer",
            "terminology",
            "document_prefixes",
        ]

    @extend_schema_field(serializers.URLField(allow_blank=True))
    def get_logo_url(self, obj) -> str:
        if obj.logo:
            url = obj.logo.url
        else:
            url = obj.logo_url
        if not url:
            return ""
        request = self.context.get("request")
        if request is not None and url.startswith("/"):
            return request.build_absolute_uri(url)
        return url

    def validate_primary_color(self, value):
        if len(value) != 7 or not value.startswith("#"):
            raise serializers.ValidationError("Use a six-digit hex colour.")
        try:
            int(value[1:], 16)
        except ValueError as exc:
            raise serializers.ValidationError(
                "Use a six-digit hex colour."
            ) from exc
        return value.upper()

    def validate_accent_color(self, value):
        return self.validate_primary_color(value)

    def validate_terminology(self, value):
        allowed = {"location", "customer", "supplier", "product", "sale"}
        unknown = set(value) - allowed
        if unknown:
            raise serializers.ValidationError(
                f"Unsupported terminology keys: {', '.join(sorted(unknown))}."
            )
        return {key: str(label)[:40] for key, label in value.items()}


class CompanyLogoSerializer(serializers.Serializer):
    logo = serializers.FileField()

    def validate_logo(self, value):
        if value.size > 2 * 1024 * 1024:
            raise serializers.ValidationError("Logo files must be 2 MB or smaller.")

        extension = Path(value.name).suffix.lower()
        allowed_extensions = {".png", ".jpg", ".jpeg", ".webp", ".svg"}
        if extension not in allowed_extensions:
            raise serializers.ValidationError(
                "Upload a PNG, JPEG, WebP, or SVG image."
            )

        content = value.read()
        value.seek(0)
        if extension == ".png" and not content.startswith(b"\x89PNG\r\n\x1a\n"):
            raise serializers.ValidationError("The uploaded PNG file is invalid.")
        if extension in {".jpg", ".jpeg"} and not content.startswith(b"\xff\xd8\xff"):
            raise serializers.ValidationError("The uploaded JPEG file is invalid.")
        if extension == ".webp" and not (
            content.startswith(b"RIFF") and content[8:12] == b"WEBP"
        ):
            raise serializers.ValidationError("The uploaded WebP file is invalid.")
        if extension == ".svg":
            try:
                svg = content.decode("utf-8").lower()
            except UnicodeDecodeError as exc:
                raise serializers.ValidationError(
                    "The uploaded SVG file is invalid."
                ) from exc
            unsafe = (
                "<script",
                "<foreignobject",
                "<!doctype",
                "<!entity",
                "javascript:",
            )
            if "<svg" not in svg or any(token in svg for token in unsafe):
                raise serializers.ValidationError(
                    "The SVG contains unsupported or unsafe content."
                )
            if re.search(r"\son[a-z]+\s*=", svg):
                raise serializers.ValidationError(
                    "The SVG contains unsupported event attributes."
                )
        return value


class CompanySettingsSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=180)
    primary_color = serializers.CharField(max_length=7)
    currency = serializers.CharField(max_length=3)
    receipt_header = serializers.CharField(
        max_length=220, required=False, allow_blank=True
    )
    receipt_footer = serializers.CharField(
        max_length=1000, required=False, allow_blank=True
    )
    address = serializers.JSONField()

    def validate_primary_color(self, value):
        if not re.fullmatch(r"#[0-9A-Fa-f]{6}", value):
            raise serializers.ValidationError("Use a six-digit hex colour.")
        return value.upper()

    def validate_currency(self, value):
        value = value.upper()
        if not re.fullmatch(r"[A-Z]{3}", value):
            raise serializers.ValidationError(
                "Use a three-letter currency code such as NGN."
            )
        return value

    def validate_address(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Address must be an object.")
        allowed = {
            "line1",
            "line2",
            "city",
            "state",
            "postal_code",
            "country",
        }
        unknown = set(value) - allowed
        if unknown:
            raise serializers.ValidationError(
                f"Unsupported address fields: {', '.join(sorted(unknown))}."
            )
        cleaned = {
            key: str(item).strip()[:180]
            for key, item in value.items()
            if str(item).strip()
        }
        if not cleaned.get("line1") or not cleaned.get("country"):
            raise serializers.ValidationError(
                "Address line 1 and country are required."
            )
        return cleaned


class CapabilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Capability
        fields = ["code", "name", "module_code", "description"]


class RoleSerializer(serializers.ModelSerializer):
    capabilities = serializers.SlugRelatedField(
        slug_field="code", many=True, queryset=Capability.objects.all()
    )

    class Meta:
        model = Role
        fields = ["id", "name", "code", "description", "is_system", "capabilities"]
        read_only_fields = ["id", "is_system"]

    def create(self, validated_data):
        capabilities = validated_data.pop("capabilities", [])
        validated_data.pop("organization", None)
        role = Role.objects.create(
            organization=self.context["request"].organization, **validated_data
        )
        RoleCapability.objects.bulk_create(
            [
                RoleCapability(
                    organization=role.organization,
                    role=role,
                    capability=capability,
                )
                for capability in capabilities
            ]
        )
        return role

    def update(self, instance, validated_data):
        capabilities = validated_data.pop("capabilities", None)
        instance = super().update(instance, validated_data)
        if capabilities is not None:
            RoleCapability.objects.filter(
                organization=instance.organization, role=instance
            ).delete()
            RoleCapability.objects.bulk_create(
                [
                    RoleCapability(
                        organization=instance.organization,
                        role=instance,
                        capability=capability,
                    )
                    for capability in capabilities
                ]
            )
        return instance


class UserSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = get_user_model()
        fields = ["id", "email", "full_name", "phone"]


class MembershipSerializer(serializers.ModelSerializer):
    user = UserSummarySerializer(read_only=True)
    roles = serializers.SerializerMethodField()

    class Meta:
        model = Membership
        fields = ["id", "user", "status", "title", "is_owner", "joined_at", "roles"]

    def get_roles(self, obj) -> list[dict]:
        return [
            {
                "role_id": str(assignment.role_id),
                "role": assignment.role.name,
                "location_id": str(assignment.location_id)
                if assignment.location_id
                else None,
            }
            for assignment in obj.role_assignments.select_related("role", "location")
        ]


class InvitationSerializer(serializers.ModelSerializer):
    location_ids = serializers.PrimaryKeyRelatedField(
        source="locations",
        queryset=Location.objects.all(),
        many=True,
        required=False,
    )

    class Meta:
        model = Invitation
        fields = [
            "id",
            "email",
            "role",
            "location_ids",
            "status",
            "expires_at",
            "created_at",
        ]
        read_only_fields = ["id", "status", "expires_at", "created_at"]

    def validate(self, attrs):
        organization = self.context["request"].organization
        role = attrs["role"]
        if role.organization_id != organization.id:
            raise serializers.ValidationError("Role belongs to another organization.")
        for location in attrs.get("locations", []):
            if location.organization_id != organization.id:
                raise serializers.ValidationError(
                    "A selected location belongs to another organization."
                )
        return attrs

    def create(self, validated_data):
        locations = validated_data.pop("locations", [])
        validated_data.pop("organization", None)
        raw_token, token_hash = Invitation.create_token()
        invitation = Invitation.objects.create(
            organization=self.context["request"].organization,
            invited_by=self.context["request"].user,
            token_hash=token_hash,
            expires_at=Invitation.default_expiry(),
            **validated_data,
        )
        InvitationLocationScope.objects.bulk_create(
            [
                InvitationLocationScope(
                    organization=invitation.organization,
                    invitation=invitation,
                    location=location,
                )
                for location in locations
            ]
        )
        self.context["invitation_token"] = raw_token
        return invitation


class InvitationAcceptanceSerializer(serializers.Serializer):
    token = serializers.CharField()
    organization_slug = serializers.SlugField(required=False)


class ModuleSerializer(serializers.ModelSerializer):
    code = serializers.CharField(source="module.code", read_only=True)
    name = serializers.CharField(source="module.name", read_only=True)
    version = serializers.CharField(source="module.version", read_only=True)
    navigation = serializers.JSONField(source="module.navigation", read_only=True)

    class Meta:
        model = TenantModule
        fields = ["id", "code", "name", "version", "status", "config", "navigation"]
        read_only_fields = ["id", "code", "name", "version", "navigation"]


class CustomFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomFieldDefinition
        fields = [
            "id",
            "module_code",
            "entity_type",
            "key",
            "label",
            "field_type",
            "required",
            "options",
            "validation",
            "is_active",
        ]
        read_only_fields = ["id"]

    def validate(self, attrs):
        supported = {
            "commerce": {"product", "customer", "supplier", "expense"},
            "agriculture": set(),
            "academic": set(),
            "services": set(),
        }
        module_code = attrs.get(
            "module_code", getattr(self.instance, "module_code", None)
        )
        entity_type = attrs.get(
            "entity_type", getattr(self.instance, "entity_type", None)
        )
        if entity_type not in supported.get(module_code, set()):
            raise serializers.ValidationError(
                "This record type does not support custom fields."
            )
        organization = self.context["request"].organization
        if not TenantModule.objects.filter(
            organization=organization,
            module__code=module_code,
            status__in=[
                TenantModule.Status.ACTIVE,
                TenantModule.Status.READ_ONLY,
            ],
        ).exists():
            raise serializers.ValidationError(
                "This module is not available for the organization."
            )
        if (
            attrs.get("field_type") == CustomFieldDefinition.FieldType.SELECT
            and not attrs.get("options")
        ):
            raise serializers.ValidationError(
                {"options": "Select fields require at least one option."}
            )
        return attrs


class OnboardingSerializer(serializers.Serializer):
    owner_name = serializers.CharField(max_length=180)
    organization_name = serializers.CharField(max_length=180)
    legal_name = serializers.CharField(max_length=220, required=False, allow_blank=True)
    slug = serializers.RegexField(
        regex=r"^[a-z][a-z0-9-]{2,62}$",
        max_length=63,
        error_messages={
            "invalid": (
                "Use 3-63 lowercase letters, numbers, or hyphens, "
                "starting with a letter."
            )
        },
    )
    industry_code = serializers.CharField(max_length=40, default="commerce")
    location_name = serializers.CharField(max_length=180, default="Main Store")
    location_kind = serializers.ChoiceField(
        choices=Location.Kind.choices, default=Location.Kind.STORE
    )

    def validate_slug(self, value):
        if value in Organization.RESERVED_SLUGS:
            raise serializers.ValidationError("This tenant address is reserved.")
        if Organization.objects.filter(slug=value).exists():
            raise serializers.ValidationError("This tenant address is unavailable.")
        return value

    def create(self, validated_data):
        user = self.context["request"].user
        if user.full_name != validated_data["owner_name"]:
            user.full_name = validated_data["owner_name"]
            user.save(update_fields=["full_name"])
        organization, location = provision_organization(
            owner=user,
            name=validated_data["organization_name"],
            legal_name=validated_data.get("legal_name", ""),
            slug=validated_data["slug"],
            industry_code=validated_data["industry_code"],
            location_name=validated_data["location_name"],
            location_kind=validated_data["location_kind"],
        )
        return {"organization": organization, "location": location}
