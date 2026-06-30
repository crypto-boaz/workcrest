from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from organizations.models import Organization, TenantModule
from organizations.services import provision_organization
from organizations.tenancy import activate_organization
from subscriptions.models import Invoice, ManualPayment, Plan, Subscription

from .models import SupportSession


class PlatformPlanSerializer(serializers.ModelSerializer):
    module_codes = serializers.SlugRelatedField(
        source="modules", slug_field="code", many=True, read_only=True
    )

    class Meta:
        model = Plan
        fields = [
            "id",
            "code",
            "name",
            "description",
            "limits",
            "features",
            "module_codes",
            "is_active",
            "sort_order",
        ]


class PlatformSubscriptionSerializer(serializers.ModelSerializer):
    plan_name = serializers.CharField(source="plan.name", read_only=True)

    class Meta:
        model = Subscription
        fields = [
            "id",
            "organization",
            "plan",
            "plan_name",
            "status",
            "trial_ends_at",
            "current_period_starts_at",
            "current_period_ends_at",
            "grace_ends_at",
            "cancelled_at",
            "override_limits",
            "notes",
        ]
        read_only_fields = ["id", "organization", "cancelled_at"]


class PlatformOrganizationSerializer(serializers.ModelSerializer):
    subscription = serializers.SerializerMethodField()

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
            "cancelled_at",
            "purge_after",
            "subscription",
            "created_at",
        ]
        read_only_fields = ["id", "cancelled_at", "purge_after", "created_at"]

    def get_subscription(self, obj) -> dict | None:
        activate_organization(obj.id)
        subscription = obj.subscription_set.select_related("plan").first()
        return (
            PlatformSubscriptionSerializer(subscription).data
            if subscription
            else None
        )


class TenantProvisionSerializer(serializers.Serializer):
    owner_email = serializers.EmailField()
    owner_name = serializers.CharField(max_length=180)
    name = serializers.CharField(max_length=180)
    legal_name = serializers.CharField(max_length=220, required=False, allow_blank=True)
    slug = serializers.SlugField(max_length=63)
    industry_code = serializers.CharField(max_length=40, default="commerce")
    location_name = serializers.CharField(max_length=180, default="Main Store")

    def validate_slug(self, value):
        if value in Organization.RESERVED_SLUGS:
            raise serializers.ValidationError("This address is reserved.")
        if Organization.objects.filter(slug=value).exists():
            raise serializers.ValidationError("This address is unavailable.")
        return value

    def create(self, validated_data):
        User = get_user_model()
        owner, _ = User.objects.get_or_create(
            email=validated_data["owner_email"].lower(),
            defaults={"full_name": validated_data["owner_name"], "is_active": True},
        )
        return provision_organization(
            owner=owner,
            name=validated_data["name"],
            legal_name=validated_data.get("legal_name", ""),
            slug=validated_data["slug"],
            industry_code=validated_data["industry_code"],
            location_name=validated_data["location_name"],
        )[0]


class TenantModuleControlSerializer(serializers.ModelSerializer):
    module_code = serializers.CharField(source="module.code", read_only=True)
    module_name = serializers.CharField(source="module.name", read_only=True)

    class Meta:
        model = TenantModule
        fields = [
            "id",
            "organization",
            "module",
            "module_code",
            "module_name",
            "status",
            "config",
            "activated_at",
        ]
        read_only_fields = [
            "id",
            "module_code",
            "module_name",
            "activated_at",
        ]

    def validate(self, attrs):
        organization = attrs.get(
            "organization", getattr(self.instance, "organization", None)
        )
        module = attrs.get("module", getattr(self.instance, "module", None))
        status_value = attrs.get(
            "status", getattr(self.instance, "status", TenantModule.Status.ACTIVE)
        )
        context_organization = getattr(
            self.context.get("view"), "control_organization", None
        )
        if context_organization and organization != context_organization:
            raise serializers.ValidationError(
                "Organization does not match the control-plane context."
            )
        if (
            organization
            and module
            and status_value != TenantModule.Status.DISABLED
        ):
            subscription = Subscription.objects.select_related("plan").filter(
                organization=organization
            ).first()
            if not subscription or not subscription.plan.modules.filter(
                id=module.id
            ).exists():
                raise serializers.ValidationError(
                    "The tenant plan does not include this module."
                )
        return attrs


class InvoiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Invoice
        fields = [
            "id",
            "organization",
            "subscription",
            "number",
            "amount",
            "currency",
            "status",
            "issued_at",
            "due_at",
            "paid_at",
            "notes",
            "created_at",
        ]
        read_only_fields = ["id", "paid_at", "created_at"]

    def validate(self, attrs):
        subscription = attrs.get(
            "subscription", getattr(self.instance, "subscription", None)
        )
        organization = attrs.get(
            "organization", getattr(self.instance, "organization", None)
        )
        context_organization = self.context["view"].control_organization
        if organization != context_organization:
            raise serializers.ValidationError(
                "Organization does not match the control-plane context."
            )
        if subscription.organization_id != organization.id:
            raise serializers.ValidationError(
                "Subscription and invoice organization must match."
            )
        return attrs


class ManualPaymentSerializer(serializers.ModelSerializer):
    extend_days = serializers.IntegerField(
        min_value=1, max_value=730, write_only=True, default=30
    )

    class Meta:
        model = ManualPayment
        fields = [
            "id",
            "organization",
            "invoice",
            "amount",
            "currency",
            "reference",
            "received_at",
            "recorded_by",
            "metadata",
            "extend_days",
        ]
        read_only_fields = ["id", "recorded_by"]

    def validate(self, attrs):
        organization = attrs.get(
            "organization", getattr(self.instance, "organization", None)
        )
        invoice = attrs.get("invoice", getattr(self.instance, "invoice", None))
        context_organization = self.context["view"].control_organization
        if organization != context_organization:
            raise serializers.ValidationError(
                "Organization does not match the control-plane context."
            )
        if invoice.organization_id != organization.id:
            raise serializers.ValidationError(
                "Invoice and payment organization must match."
            )
        if invoice.status in {Invoice.Status.PAID, Invoice.Status.VOID}:
            raise serializers.ValidationError("This invoice cannot receive a payment.")
        if attrs.get("amount", self.instance.amount if self.instance else 0) < invoice.amount:
            raise serializers.ValidationError(
                "Partial manual payments are not supported in v1."
            )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        extend_days = validated_data.pop("extend_days")
        payment = ManualPayment.objects.create(
            recorded_by=self.context["request"].user, **validated_data
        )
        invoice = Invoice.objects.select_for_update().get(pk=payment.invoice_id)
        invoice.status = Invoice.Status.PAID
        invoice.paid_at = payment.received_at
        invoice.save(update_fields=["status", "paid_at", "updated_at"])
        subscription = Subscription.objects.select_for_update().get(
            pk=invoice.subscription_id
        )
        now = timezone.now()
        start = max(subscription.current_period_ends_at or now, now)
        subscription.status = Subscription.Status.ACTIVE
        subscription.current_period_starts_at = now
        subscription.current_period_ends_at = start + timedelta(days=extend_days)
        subscription.grace_ends_at = None
        subscription.save(
            update_fields=[
                "status",
                "current_period_starts_at",
                "current_period_ends_at",
                "grace_ends_at",
                "updated_at",
            ]
        )
        organization = subscription.organization
        organization.status = Organization.Status.ACTIVE
        organization.save(update_fields=["status", "updated_at"])
        return payment


class SupportSessionSerializer(serializers.ModelSerializer):
    active = serializers.BooleanField(source="is_active", read_only=True)

    class Meta:
        model = SupportSession
        fields = [
            "id",
            "platform_user",
            "organization",
            "reason",
            "expires_at",
            "ended_at",
            "created_ip",
            "active",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "platform_user",
            "ended_at",
            "created_ip",
            "active",
            "created_at",
        ]

    def validate_reason(self, value):
        if len(value.strip()) < 12:
            raise serializers.ValidationError(
                "Give a specific support-access reason."
            )
        return value

    def validate_expires_at(self, value):
        now = timezone.now()
        if value <= now or value > now + timedelta(hours=4):
            raise serializers.ValidationError(
                "Support access must expire within four hours."
            )
        return value

    def validate_organization(self, value):
        context_organization = self.context["view"].control_organization
        if value != context_organization:
            raise serializers.ValidationError(
                "Organization does not match the control-plane context."
            )
        return value

    def create(self, validated_data):
        request = self.context["request"]
        forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
        ip = forwarded.split(",")[0].strip() if forwarded else request.META.get(
            "REMOTE_ADDR"
        )
        return SupportSession.objects.create(
            platform_user=request.user, created_ip=ip or None, **validated_data
        )
