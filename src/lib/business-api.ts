import type { components } from "@/lib/api-schema";
import type {
  BusinessState,
  CustomerInput,
  ExpenseInput,
  PaymentMethod,
  Product,
  ProductInput,
  PurchaseInput,
  StaffRole,
  StaffInput,
} from "@/lib/business-types";
import { apiRequest, secureApiRequest } from "@/lib/platform-api";
import type { TenantBootstrap } from "@/lib/platform-types";

type Page<T> = {
  results?: T[];
};

type ApiProduct = components["schemas"]["Product"];
type ApiCategory = components["schemas"]["Category"];

const page = <T>(path: string) =>
  apiRequest<Page<T>>(path).catch(() => ({ results: [] }));

const locationPath = (locationId: string, resource: string) =>
  `/api/v1/locations/${locationId}/${resource}`;

const paymentLabel = (method?: string): PaymentMethod =>
  method === "card" ? "Card" : method === "transfer" ? "Transfer" : "Cash";

const roleName = (value?: string): StaffRole => {
  if (value === "Owner" || value === "Cashier" || value === "Inventory") {
    return value;
  }
  return "Manager";
};

export function mapApiProduct(product: ApiProduct): Product {
  return {
    id: product.id ?? "",
    name: product.name ?? "Product",
    sku: product.sku ?? "",
    barcode: product.barcode ?? "",
    qrIdentifier: product.qr_identifier,
    category: product.category_name ?? "Uncategorised",
    price: Number(product.selling_price ?? 0),
    cost: Number(product.cost_price ?? 0),
    stock: Number(product.stock_quantity ?? 0),
    reorderLevel: Number(product.reorder_level ?? 0),
    status: product.status ?? "active",
    updatedAt: product.updated_at ?? new Date().toISOString(),
  };
}

export async function loadBusinessState(
  locationId: string,
  bootstrap: TenantBootstrap,
): Promise<BusinessState> {
  const [
    products,
    sales,
    held,
    suppliers,
    returns,
    expenses,
    notifications,
    memberships,
    invitations,
    roles,
  ] = await Promise.all([
    page<components["schemas"]["Product"]>(
      locationPath(locationId, "products/?page_size=100"),
    ),
    page<components["schemas"]["Sale"]>(locationPath(locationId, "sales/")),
    page<components["schemas"]["HeldCart"]>(
      locationPath(locationId, "held-carts/?page_size=100"),
    ),
    page<components["schemas"]["Supplier"]>(
      locationPath(locationId, "suppliers/?page_size=100"),
    ),
    page<components["schemas"]["ReturnRecord"]>(
      locationPath(locationId, "returns/"),
    ),
    page<components["schemas"]["Expense"]>(
      locationPath(locationId, "expenses/?page_size=100"),
    ),
    page<components["schemas"]["Notification"]>(
      "/api/v1/notifications/",
    ),
    page<components["schemas"]["Membership"]>(
      "/api/v1/memberships/?page_size=100",
    ),
    page<components["schemas"]["Invitation"]>(
      "/api/v1/invitations/?page_size=100",
    ),
    page<components["schemas"]["Role"]>("/api/v1/roles/?page_size=100"),
  ]);
  const customers: Page<components["schemas"]["Customer"]> = { results: [] };
  const purchases: Page<components["schemas"]["PurchaseOrder"]> = {
    results: [],
  };

  const mappedSales = (sales.results ?? []).map((sale) => ({
    sourceId: sale.id,
    id: sale.number ?? sale.id ?? "",
    receiptQrIdentifier: sale.receipt_qr_identifier,
    customerId: sale.customer ?? undefined,
    customerName: sale.customer_name ?? "Walk-in customer",
    items: (sale.items ?? []).map((item) => ({
      sourceItemId: item.id,
      productId: item.product ?? "",
      name: item.product_name ?? "Product",
      sku: item.sku ?? "",
      barcode: item.barcode ?? "",
      productQrIdentifier: item.product_qr_identifier,
      quantity: Number(item.quantity ?? 0),
      unitPrice: Number(item.unit_price ?? 0),
      cost: Number(item.unit_cost ?? 0),
    })),
    subtotal: Number(sale.subtotal ?? 0),
    discount: Number(sale.discount ?? 0),
    total: Number(sale.total ?? 0),
    paymentMethod: paymentLabel(sale.payments?.[0]?.method),
    status:
      sale.status === "refunded" || sale.status === "partially_returned"
        ? ("refunded" as const)
        : ("completed" as const),
    createdAt:
      sale.completed_at ?? sale.created_at ?? new Date().toISOString(),
    cashier: sale.cashier_name ?? "Team member",
  }));

  return {
    products: (products.results ?? []).map(mapApiProduct),
    customers: (customers.results ?? []).map((customer) => ({
      id: customer.id ?? "",
      name: customer.name ?? "Customer",
      phone: customer.phone ?? "",
      email: customer.email ?? "",
      totalSpent: 0,
      outstanding: Number(customer.balance ?? 0),
      orders: mappedSales.filter((sale) => sale.customerId === customer.id)
        .length,
      createdAt: customer.created_at ?? new Date().toISOString(),
    })),
    sales: mappedSales,
    heldSales: (held.results ?? []).map((cart) => ({
      id: cart.id ?? "",
      customerId: cart.customer ?? undefined,
      items: (cart.items ?? []) as BusinessState["heldSales"][number]["items"],
      discount: Number(cart.discount ?? 0),
      createdAt: cart.created_at ?? new Date().toISOString(),
    })),
    suppliers: (suppliers.results ?? []).map((supplier) => ({
      id: supplier.id ?? "",
      name: supplier.name ?? "Supplier",
      contactName: supplier.contact_name ?? "",
      phone: supplier.phone ?? "",
      email: supplier.email ?? "",
      balance: Number(supplier.balance ?? 0),
    })),
    purchases: (purchases.results ?? []).map((purchase) => ({
      id: purchase.id ?? "",
      supplierId: purchase.supplier ?? "",
      supplierName: purchase.supplier_name ?? "Supplier",
      items: (purchase.items ?? []).map((item) => ({
        productId: item.product ?? "",
        name: item.product_name ?? "Product",
        quantity: Number(item.quantity ?? 0),
        unitCost: Number(item.unit_cost ?? 0),
      })),
      total: Number(purchase.total ?? 0),
      status:
        purchase.status === "received"
          ? ("received" as const)
          : purchase.status === "draft"
            ? ("draft" as const)
            : ("ordered" as const),
      createdAt: purchase.created_at ?? new Date().toISOString(),
      expectedAt: purchase.expected_at ?? "",
    })),
    returns: (returns.results ?? []).flatMap((record) =>
      (record.items ?? []).map((item) => ({
        id: item.id ?? record.id ?? "",
        saleId: record.sale_number ?? record.sale ?? "",
        productId: item.product ?? "",
        itemName: item.product_name ?? "Product",
        customerName: "",
        quantity: Number(item.quantity ?? 0),
        amount: Number(item.line_total ?? 0),
        reason: record.reason ?? "",
        status: "approved" as const,
        createdAt: record.created_at ?? new Date().toISOString(),
      })),
    ),
    staff: [
      ...(memberships.results ?? []).map((membership) => ({
        id: membership.id ?? "",
        name: membership.user?.full_name ?? membership.user?.email ?? "Staff",
        email: membership.user?.email ?? "",
        phone: membership.user?.phone ?? "",
        role: membership.is_owner
          ? ("Owner" as const)
          : roleName(
              String(
                (
                  membership.roles as
                    | Array<{ role?: string }>
                    | undefined
                )?.[0]?.role ?? "",
              ),
            ),
        status: membership.status ?? "active",
        permissions: [],
        lastActive: membership.joined_at ?? new Date().toISOString(),
      })),
      ...(invitations.results ?? [])
        .filter((invitation) => invitation.status === "pending")
        .map((invitation) => {
          const invitationRole = roles.results?.find(
            (role) => role.id === invitation.role,
          );
          return {
            id: invitation.id ?? "",
            name: invitation.email?.split("@")[0] ?? "Invited staff",
            email: invitation.email ?? "",
            phone: "",
            role: roleName(invitationRole?.name),
            status: "invited" as const,
            permissions: [],
            lastActive:
              invitation.created_at ?? new Date().toISOString(),
          };
        }),
    ],
    expenses: (expenses.results ?? []).map((expense) => ({
      id: expense.id ?? "",
      title: expense.title ?? "Expense",
      category: expense.category ?? "",
      amount: Number(expense.amount ?? 0),
      date: expense.incurred_at ?? new Date().toISOString(),
      paymentMethod: paymentLabel(String(expense.payment_method ?? "")),
      status: expense.status ?? "paid",
      notes: expense.notes ?? "",
    })),
    notifications: (notifications.results ?? []).map((notification) => ({
      id: notification.id ?? "",
      title: notification.title ?? "Notification",
      body: notification.body ?? "",
      tone:
        notification.tone === "warning"
          ? "warning"
          : notification.tone === "success"
            ? "success"
            : "info",
      unread: !notification.read_at,
      createdAt: notification.created_at ?? new Date().toISOString(),
      href: notification.href || "/alerts",
    })),
    settings: {
      businessName: bootstrap.organization.name,
      email: bootstrap.locations.find((item) => item.id === locationId)?.email ?? "",
      phone: bootstrap.locations.find((item) => item.id === locationId)?.phone ?? "",
      address: Object.values(
        bootstrap.locations.find((item) => item.id === locationId)?.address ?? {},
      )
        .filter(Boolean)
        .join(", "),
      currency: bootstrap.organization.currency,
      lowStockNotifications: true,
      dailySummary: true,
    },
  };
}

const categoryCache = new Map<string, string>();
const categoryListRequests = new Map<string, Promise<Page<ApiCategory>>>();

function categoryKey(locationId: string, name: string) {
  return `${locationId}:${name.trim().toLowerCase()}`;
}

async function ensureCategory(locationId: string, name: string) {
  const safeName = name.trim() || "Other";
  const key = categoryKey(locationId, safeName);
  const cached = categoryCache.get(key);
  if (cached) return cached;

  let categoriesRequest = categoryListRequests.get(locationId);
  if (!categoriesRequest) {
    categoriesRequest = apiRequest<Page<ApiCategory>>(
      locationPath(locationId, "categories/?page_size=100"),
    );
    categoryListRequests.set(locationId, categoriesRequest);
  }
  const categories = await categoriesRequest;
  for (const category of categories.results ?? []) {
    if (category.id && category.name) {
      categoryCache.set(categoryKey(locationId, category.name), category.id);
    }
  }
  const existing = categories.results?.find(
    (category) => category.name?.toLowerCase() === safeName.toLowerCase(),
  );
  if (existing?.id) return existing.id;
  const slug =
    safeName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "general";
  const category = await secureApiRequest<ApiCategory>(
    locationPath(locationId, "categories/"),
    {
      method: "POST",
      body: JSON.stringify({ name: safeName, slug, is_active: true }),
    },
  );
  if (!category.id) throw new Error("Category could not be created.");
  categoryCache.set(key, category.id);
  return category.id;
}

export const businessApi = {
  createProduct: async (locationId: string, input: ProductInput) => {
    const category = await ensureCategory(locationId, input.category);
    const product = await secureApiRequest<ApiProduct>(
      locationPath(locationId, "products/"),
      {
        method: "POST",
        body: JSON.stringify({
          name: input.name,
          sku: input.sku,
          barcode: input.barcode,
          category,
          unit: "item",
          selling_price: input.price.toFixed(2),
          cost_price: input.cost.toFixed(2),
          reorder_level: input.reorderLevel.toFixed(3),
          opening_quantity: input.stock.toFixed(3),
          custom_data: {},
        }),
      },
    );
    return mapApiProduct(product);
  },
  updateProduct: async (
    locationId: string,
    id: string,
    input: ProductInput,
  ) => {
    const category = await ensureCategory(locationId, input.category);
    const product = await secureApiRequest<ApiProduct>(
      locationPath(locationId, `products/${id}/`),
      {
        method: "PATCH",
        body: JSON.stringify({
          name: input.name,
          sku: input.sku,
          barcode: input.barcode,
          category,
          selling_price: input.price.toFixed(2),
          cost_price: input.cost.toFixed(2),
          reorder_level: input.reorderLevel.toFixed(3),
          custom_data: {},
        }),
      },
    );
    return mapApiProduct(product);
  },
  setProductStatus: (
    locationId: string,
    id: string,
    status: "active" | "archived",
  ) =>
    secureApiRequest<ApiProduct>(locationPath(locationId, `products/${id}/`), {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }).then(mapApiProduct),
  adjustStock: (
    locationId: string,
    id: string,
    quantity: number,
    reason: string,
  ) =>
    secureApiRequest(locationPath(locationId, `products/${id}/adjust-stock/`), {
      method: "POST",
      body: JSON.stringify({
        quantity: quantity.toFixed(3),
        reason,
      }),
    }),
  createCustomer: (locationId: string, input: CustomerInput) =>
    secureApiRequest(locationPath(locationId, "customers/"), {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        phone: input.phone,
        email: input.email,
        custom_data: {},
      }),
    }),
  createPurchase: (locationId: string, input: PurchaseInput) =>
    secureApiRequest(locationPath(locationId, "purchases/"), {
      method: "POST",
      body: JSON.stringify({
        supplier: input.supplierId,
        expected_at: input.expectedAt || null,
        items: [
          {
            product: input.productId,
            quantity: input.quantity.toFixed(3),
            unit_cost: input.unitCost.toFixed(2),
          },
        ],
      }),
    }),
  receivePurchase: (locationId: string, id: string) =>
    secureApiRequest(locationPath(locationId, `purchases/${id}/receive/`), {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({}),
    }),
  createReturn: (
    locationId: string,
    saleId: string,
    reason: string,
    items: Array<{ saleItemId: string; quantity: number }>,
  ) =>
    secureApiRequest(locationPath(locationId, "returns/"), {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        sale_id: saleId,
        reason,
        items: items.map((item) => ({
          sale_item_id: item.saleItemId,
          quantity: item.quantity.toFixed(3),
        })),
      }),
    }),
  inviteStaff: async (
    input: StaffInput,
    locationId: string,
  ) => {
    const roles = await apiRequest<Page<components["schemas"]["Role"]>>(
      "/api/v1/roles/?page_size=100",
    );
    const role = roles.results?.find(
      (item) => item.name?.toLowerCase() === input.role.toLowerCase(),
    );
    if (!role?.id) throw new Error("The selected role is not available.");
    return secureApiRequest("/api/v1/invitations/", {
      method: "POST",
      body: JSON.stringify({
        email: input.email,
        role: role.id,
        location_ids: [locationId],
      }),
    });
  },
  updateStaffStatus: (
    id: string,
    status: "active" | "suspended",
  ) =>
    secureApiRequest(`/api/v1/memberships/${id}/`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  createExpense: (locationId: string, input: ExpenseInput) =>
    secureApiRequest(locationPath(locationId, "expenses/"), {
      method: "POST",
      body: JSON.stringify({
        title: input.title,
        category: input.category,
        amount: input.amount.toFixed(2),
        incurred_at: new Date(input.date).toISOString(),
        payment_method: input.paymentMethod.toLowerCase(),
        status: input.status,
        notes: input.notes,
        custom_data: {},
      }),
    }),
};
