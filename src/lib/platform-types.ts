export interface TenantBranding {
  display_name: string;
  logo_url: string;
  favicon_url: string;
  primary_color: string;
  accent_color: string;
  receipt_header: string;
  receipt_footer: string;
  terminology: Record<string, string>;
  document_prefixes: Record<string, string>;
}

export interface TenantManifest {
  organization: {
    slug: string;
    industry_code: string;
    locale: string;
    currency: string;
  };
  branding: TenantBranding;
}

export interface PlatformUser {
  id: string;
  email: string;
  full_name: string;
  phone: string;
}

export interface TenantLocation {
  id: string;
  name: string;
  code: string;
  kind: string;
  timezone: string;
  address: Record<string, string>;
  phone: string;
  email: string;
  is_primary: boolean;
  is_active: boolean;
}

export interface TenantModule {
  id: string;
  code: string;
  name: string;
  version: string;
  status: "active" | "read_only" | "disabled";
  config: Record<string, unknown>;
  navigation: string[];
}

export interface TenantBootstrap {
  user: PlatformUser;
  organization: {
    id: string;
    slug: string;
    name: string;
    legal_name: string;
    industry_code: string;
    job_cards_enabled?: boolean;
    status: string;
    timezone: string;
    currency: string;
    locale: string;
  };
  membership: {
    id: string;
    status: string;
    title: string;
    is_owner: boolean;
    roles: Array<{
      role_id: string;
      role: string;
      location_id: string | null;
    }>;
  } | null;
  locations: TenantLocation[];
  branding: TenantBranding;
  modules: TenantModule[];
  capabilities: string[];
  entitlements: {
    plan: string | null;
    status: string;
    limits: Record<string, number | null>;
    features: string[];
    allows_write: boolean;
    trial_ends_at?: string;
    period_ends_at?: string;
    grace_ends_at?: string;
  };
  custom_fields: unknown[];
  support_session: {
    id: string;
    reason: string;
    expires_at: string;
    actor: PlatformUser;
  } | null;
}

export interface CompanySettingsResponse {
  organization: TenantBootstrap["organization"];
  branding: TenantBranding;
  primary_location: TenantLocation;
}

export interface CompanySettingsInput {
  name: string;
  primary_color: string;
  currency: string;
  receipt_header: string;
  receipt_footer: string;
  address: {
    line1: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country: string;
  };
}

export interface ApiErrorPayload {
  status?: number;
  code?: string;
  message?: string;
  detail?: string;
  data?: {
    flows?: Array<{ id?: string; is_pending?: boolean }>;
  };
  errors?: Array<{ message?: string; code?: string; param?: string }>;
  field_errors?: Record<string, string[] | string>;
  request_id?: string;
}
