from django.contrib import admin

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
    TenantDomain,
    TenantModule,
)


admin.site.register(
    [
        Organization,
        Location,
        TenantDomain,
        BrandingProfile,
        ModuleDefinition,
        TenantModule,
        Capability,
        Role,
        RoleCapability,
        Membership,
        RoleAssignment,
        Invitation,
        InvitationLocationScope,
        CustomFieldDefinition,
    ]
)
