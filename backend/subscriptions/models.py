from django.conf import settings
from django.db import models
from django.utils import timezone

from organizations.models import (
    ModuleDefinition,
    Organization,
    OrganizationOwnedModel,
    UUIDTimeStampedModel,
)


class Plan(UUIDTimeStampedModel):
    code = models.SlugField(max_length=40, unique=True)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    limits = models.JSONField(default=dict)
    features = models.JSONField(default=list)
    modules = models.ManyToManyField(ModuleDefinition, through="PlanModule")
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "name"]

    def __str__(self):
        return self.name


class PlanModule(UUIDTimeStampedModel):
    plan = models.ForeignKey(Plan, on_delete=models.CASCADE)
    module = models.ForeignKey(ModuleDefinition, on_delete=models.CASCADE)
    config = models.JSONField(default=dict, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["plan", "module"], name="unique_module_per_plan"
            )
        ]


class Subscription(OrganizationOwnedModel):
    class Status(models.TextChoices):
        TRIALING = "trialing", "Trialing"
        ACTIVE = "active", "Active"
        GRACE = "grace", "Read-only grace"
        SUSPENDED = "suspended", "Suspended"
        CANCELLED = "cancelled", "Cancelled"

    plan = models.ForeignKey(Plan, on_delete=models.PROTECT)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.TRIALING
    )
    trial_ends_at = models.DateTimeField(null=True, blank=True)
    current_period_starts_at = models.DateTimeField(null=True, blank=True)
    current_period_ends_at = models.DateTimeField(null=True, blank=True)
    grace_ends_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    override_limits = models.JSONField(default=dict, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization"], name="one_subscription_per_org"
            )
        ]

    @property
    def effective_limits(self):
        return {**self.plan.limits, **self.override_limits}

    @property
    def allows_write(self):
        now = timezone.now()
        if self.status == self.Status.ACTIVE:
            return not self.current_period_ends_at or self.current_period_ends_at > now
        if self.status == self.Status.TRIALING:
            return bool(self.trial_ends_at and self.trial_ends_at > now)
        return False


class Invoice(OrganizationOwnedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ISSUED = "issued", "Issued"
        PAID = "paid", "Paid"
        VOID = "void", "Void"

    number = models.CharField(max_length=40)
    subscription = models.ForeignKey(
        Subscription, on_delete=models.CASCADE, related_name="invoices"
    )
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    currency = models.CharField(max_length=3, default="NGN")
    status = models.CharField(
        max_length=12, choices=Status.choices, default=Status.DRAFT
    )
    issued_at = models.DateTimeField(null=True, blank=True)
    due_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "number"], name="unique_invoice_per_org"
            )
        ]


class ManualPayment(OrganizationOwnedModel):
    invoice = models.ForeignKey(
        Invoice, on_delete=models.PROTECT, related_name="payments"
    )
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    currency = models.CharField(max_length=3, default="NGN")
    reference = models.CharField(max_length=100)
    received_at = models.DateTimeField(default=timezone.now)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL
    )
    metadata = models.JSONField(default=dict, blank=True)
