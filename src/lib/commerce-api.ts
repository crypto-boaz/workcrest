import type { components } from "@/lib/api-schema";
import { apiRequest, secureApiRequest } from "@/lib/platform-api";

export type ApiProduct = components["schemas"]["Product"];
export type ApiSale = components["schemas"]["Sale"];
export type ApiCustomer = components["schemas"]["Customer"];
export type ApiSupplier = components["schemas"]["Supplier"];
export type ApiNotification = components["schemas"]["Notification"];

export interface DashboardSummary {
  generated_at: string;
  metrics: {
    inventory_value: string;
    inventory_units: string;
    today_sales: string;
    today_transactions: number;
    monthly_sales: string;
    total_products: number;
    monthly_expenses: string;
    customer_debts: string;
    supplier_balance: string;
    supplier_payments: string;
  };
  sales_trend: Array<{ day: string; sales: string; transactions: number }>;
  recent_transactions: ApiSale[];
  stock_alerts: ApiProduct[];
}

export type ProductPage = components["schemas"]["PaginatedProductList"];
export type SalePage = components["schemas"]["PaginatedSaleList"];
type CustomerPage = components["schemas"]["PaginatedCustomerList"];
type HeldCartPage = components["schemas"]["PaginatedHeldCartList"];

function locationPath(locationId: string, resource: string) {
  return `/api/v1/locations/${locationId}/${resource}`;
}

export const commerceApi = {
  dashboard: (locationId: string, signal?: AbortSignal) =>
    apiRequest<DashboardSummary>(
      locationPath(locationId, "dashboard/"),
      { signal },
    ),
  products: (locationId: string, query = "", signal?: AbortSignal) =>
    apiRequest<ProductPage>(
      `${locationPath(locationId, "products/")}?page_size=100&search=${encodeURIComponent(query)}`,
      { signal },
    ),
  productById: (locationId: string, id: string) =>
    apiRequest<ApiProduct>(locationPath(locationId, `products/${id}/`)),
  productPage: (
    locationId: string,
    query: string,
    nextUrl: string,
    signal?: AbortSignal,
    pageSize = 100,
  ) => {
    const path = locationPath(locationId, "products/");
    if (!nextUrl) {
      return apiRequest<ProductPage>(
        `${path}?page_size=${pageSize}&search=${encodeURIComponent(query)}`,
        { signal },
      );
    }
    const next = new URL(nextUrl, "https://workcrest.invalid");
    if (next.pathname !== path) {
      throw new Error("Unexpected product page address.");
    }
    return apiRequest<ProductPage>(`${next.pathname}${next.search}`, { signal });
  },
  salesPage: (
    locationId: string,
    query: string,
    nextUrl: string,
    signal?: AbortSignal,
  ) => {
    const path = locationPath(locationId, "sales/");
    if (!nextUrl) {
      return apiRequest<SalePage>(
        `${path}?search=${encodeURIComponent(query)}`,
        { signal },
      );
    }
    const next = new URL(nextUrl, "https://workcrest.invalid");
    if (next.pathname !== path) {
      throw new Error("Unexpected sales page address.");
    }
    return apiRequest<SalePage>(`${next.pathname}${next.search}`, { signal });
  },
  customers: (locationId: string, signal?: AbortSignal) =>
    apiRequest<CustomerPage>(
      `${locationPath(locationId, "customers/")}?page_size=100`,
      { signal },
    ),
  heldCarts: (locationId: string, signal?: AbortSignal) =>
    apiRequest<HeldCartPage>(locationPath(locationId, "held-carts/"), {
      signal,
    }),
  createHeldCart: (
    locationId: string,
    payload: {
      customer?: string | null;
      items: Array<{
        productId: string;
        name: string;
        sku: string;
        quantity: number;
        unitPrice: number;
        cost: number;
      }>;
      discount: string;
    },
  ) =>
    secureApiRequest<components["schemas"]["HeldCart"]>(
      locationPath(locationId, "held-carts/"),
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),
  deleteHeldCart: (locationId: string, id: string) =>
    secureApiRequest(locationPath(locationId, `held-carts/${id}/`), {
      method: "DELETE",
    }),
  checkout: (
    locationId: string,
    payload: {
      items: Array<{ product_id: string; quantity: string; expected_unit_price?: string }>;
      customer_id?: string | null;
      payment_method: "cash" | "card" | "transfer";
      payment_reference?: string;
      discount?: string;
    },
    idempotencyKey: string = crypto.randomUUID(),
  ) =>
    secureApiRequest<ApiSale>(locationPath(locationId, "sales/checkout/"), {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
    }),
  saleByReceiptQr: (
    locationId: string,
    identifier: string,
    signal?: AbortSignal,
  ) =>
    apiRequest<ApiSale>(
      `${locationPath(locationId, "sales/receipt-lookup/")}?qr=${encodeURIComponent(identifier)}`,
      { signal },
    ),
  notifications: (signal?: AbortSignal) =>
    apiRequest<{ next: string | null; previous: string | null; results: ApiNotification[] }>(
      "/api/v1/notifications/",
      { signal },
    ),
  markNotificationRead: (id: string) =>
    secureApiRequest(`/api/v1/notifications/${id}/mark-read/`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  markAllNotificationsRead: () =>
    secureApiRequest("/api/v1/notifications/mark-all-read/", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  dismissNotification: (id: string) =>
    secureApiRequest(`/api/v1/notifications/${id}/dismiss/`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
};
