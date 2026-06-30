import type {
  TenantBootstrap,
  TenantManifest,
} from "@/lib/platform-types";

const branding = {
  display_name: "Timphat Cosmetics",
  logo_url: "",
  favicon_url: "",
  primary_color: "#3478EF",
  accent_color: "#10B981",
  receipt_header: "Timphat Cosmetics",
  receipt_footer: "Thank you for shopping with us.",
  terminology: {
    location: "Store",
    customer: "Customer",
    supplier: "Supplier",
    product: "Product",
    sale: "Sale",
  },
  document_prefixes: { sale: "SALE", purchase: "PO", return: "RET" },
};

export const mockPlatformManifest: TenantManifest = {
  organization: {
    slug: "workcrest",
    industry_code: "platform",
    locale: "en-NG",
    currency: "NGN",
  },
  branding: {
    display_name: "Workcrest",
    logo_url: "",
    favicon_url: "",
    primary_color: "#2563EB",
    accent_color: "#10B981",
    receipt_header: "",
    receipt_footer: "",
    terminology: {},
    document_prefixes: {},
  },
};

export const mockManifest: TenantManifest = {
  organization: {
    slug: "timphat",
    industry_code: "beauty-cosmetics",
    locale: "en-NG",
    currency: "NGN",
  },
  branding,
};

export const mockBootstrap: TenantBootstrap = {
  user: {
    id: "demo-user",
    email: "manager@demo.local",
    full_name: "Store Manager",
    phone: "",
  },
  organization: {
    id: "demo-organization",
    slug: "timphat",
    name: "Timphat Cosmetics",
    legal_name: "Timphat Cosmetics",
    industry_code: "beauty-cosmetics",
    status: "trial",
    timezone: "Africa/Lagos",
    currency: "NGN",
    locale: "en-NG",
  },
  membership: {
    id: "demo-membership",
    status: "active",
    title: "Store manager",
    is_owner: false,
    roles: [
      {
        role_id: "demo-manager-role",
        role: "Manager",
        location_id: null,
      },
    ],
  },
  locations: [
    {
      id: "demo-main-store",
      name: "Main Store",
      code: "MAIN",
      kind: "store",
      timezone: "Africa/Lagos",
      address: { city: "Lagos", country: "Nigeria" },
      phone: "",
      email: "",
      is_primary: true,
      is_active: true,
    },
  ],
  branding,
  modules: [
    {
      id: "demo-commerce-module",
      code: "commerce",
      name: "Commerce",
      version: "1.0",
      status: "active",
      config: {},
      navigation: [
        "dashboard",
        "products",
        "sales",
        "pos",
        "customers",
        "purchases",
        "returns",
        "people",
        "expenses",
        "reports",
        "alerts",
      ],
    },
  ],
  capabilities: ["*"],
  entitlements: {
    plan: "growth",
    status: "trialing",
    limits: { locations: 5, active_staff: 25 },
    features: ["commerce", "stock_transfers", "custom_roles"],
    allows_write: true,
  },
  custom_fields: [],
  support_session: null,
};
