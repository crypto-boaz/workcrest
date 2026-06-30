import type { components } from "@/lib/api-schema";
import { apiRequest, secureApiRequest } from "@/lib/platform-api";

export type ApiProduct = components["schemas"]["Product"];
export type ApiSale = components["schemas"]["Sale"];
export type ApiCustomer = components["schemas"]["Customer"];
export type ApiSupplier = components["schemas"]["Supplier"];
export type ApiNotification = components["schemas"]["Notification"];

type ProductPage = components["schemas"]["PaginatedProductList"];
type CustomerPage = components["schemas"]["PaginatedCustomerList"];
type HeldCartPage = components["schemas"]["PaginatedHeldCartList"];

function locationPath(locationId: string, resource: string) {
  return `/api/v1/locations/${locationId}/${resource}`;
}

export const commerceApi = {
  dashboard: (locationId: string, signal?: AbortSignal) =>
    apiRequest<Record<string, unknown>>(
      locationPath(locationId, "dashboard/"),
      { signal },
    ),
  products: (locationId: string, query = "", signal?: AbortSignal) =>
    apiRequest<ProductPage>(
      `${locationPath(locationId, "products/")}?page_size=100&search=${encodeURIComponent(query)}`,
      { signal },
    ),
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
      items: Array<{ product_id: string; quantity: string }>;
      customer_id?: string | null;
      payment_method: "cash" | "card" | "transfer";
      payment_reference?: string;
      discount?: string;
    },
    idempotencyKey = crypto.randomUUID(),
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
