from django.contrib import admin

from .models import Invoice, ManualPayment, Plan, PlanModule, Subscription


admin.site.register([Plan, PlanModule, Subscription, Invoice, ManualPayment])
