"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";

import { useOptionalPlatform } from "@/components/platform-provider";
import type {
  AppNotification,
  BusinessState,
  CartInput,
  CompleteSaleInput,
  CustomerInput,
  ExpenseInput,
  HeldSale,
  Product,
  ProductInput,
  PurchaseInput,
  ReturnInput,
  Sale,
  SaleItem,
  StaffInput,
} from "@/lib/business-types";
import {
  businessApi,
  loadBusinessState,
  type BusinessResource,
} from "@/lib/business-api";
import { seedBusinessState } from "@/lib/seed-business-data";
import { apiMode } from "@/lib/platform-api";
import { formatCurrency } from "@/lib/utils";

interface ToastMessage {
  id: number;
  title: string;
  body?: string;
  tone: "success" | "error" | "info";
}

interface BusinessStoreValue {
  state: BusinessState;
  hydrated: boolean;
  toast: ToastMessage | null;
  addProduct: (input: ProductInput) => Promise<boolean>;
  updateProduct: (
    id: string,
    input: ProductInput,
    expectedStock: number,
    expectedVersion?: number,
  ) => Promise<boolean>;
  archiveProduct: (product: Product) => Promise<boolean>;
  addCustomer: (input: CustomerInput) => void;
  completeSale: (input: CompleteSaleInput) => Sale;
  recordCompletedSale: (sale: Sale) => void;
  holdSale: (
    items: CartInput[],
    customerId?: string,
    discount?: number,
  ) => HeldSale;
  removeHeldSale: (id: string) => void;
  createPurchase: (input: PurchaseInput) => void;
  receivePurchase: (id: string) => void;
  createReturn: (input: ReturnInput) => void;
  addStaff: (
    input: StaffInput,
  ) => Promise<{ created: boolean; inviteUrl?: string }>;
  toggleStaffStatus: (id: string) => void;
  addExpense: (input: ExpenseInput) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  dismissNotification: (id: string) => void;
  refresh: () => Promise<void>;
  showToast: (
    title: string,
    body?: string,
    tone?: ToastMessage["tone"],
  ) => void;
}

const BusinessStoreContext = createContext<BusinessStoreValue | null>(null);

const createId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}`;

const cloneSeed = () => structuredClone(seedBusinessState);

function resourcesForPath(pathname: string): BusinessResource[] {
  switch (pathname.split("/")[1] || "dashboard") {
    case "dashboard":
      return [];
    case "products":
      return [];
    case "pos":
      return [];
    case "sales":
      return [];
    case "returns":
      return ["products", "sales", "returns"];
    case "people":
      return ["staff"];
    case "expenses":
      return ["expenses"];
    case "reports":
      return ["products", "sales", "expenses"];
    case "alerts":
      return [];
    default:
      return [];
  }
}

function mergeBusinessResources(
  current: BusinessState,
  loaded: BusinessState,
  resources: readonly BusinessResource[],
): BusinessState {
  const updates = Object.fromEntries(
    resources.map((resource) => [resource, loaded[resource]]),
  ) as Partial<BusinessState>;
  return { ...current, ...updates, settings: loaded.settings };
}

const emptyBusinessState = (
  platform?: ReturnType<typeof useOptionalPlatform>,
): BusinessState => {
  const seed = cloneSeed();
  const location = platform?.currentLocation;
  return {
    ...seed,
    products: [],
    customers: [],
    sales: [],
    heldSales: [],
    suppliers: [],
    purchases: [],
    returns: [],
    staff: [],
    expenses: [],
    notifications: [],
    settings: {
      ...seed.settings,
      businessName: platform?.bootstrap.organization.name ?? "",
      email: location?.email ?? "",
      phone: location?.phone ?? "",
      address: location
        ? Object.values(location.address).filter(Boolean).join(", ")
        : "",
      currency:
        (platform?.bootstrap.organization.currency as
          | BusinessState["settings"]["currency"]
          | undefined) ?? "NGN",
    },
  };
};

export function BusinessStoreProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const platform = useOptionalPlatform();
  const actorName = platform?.bootstrap.user.full_name || "Store manager";
  const activeScope =
    apiMode && platform?.ready
      ? `${platform.bootstrap.organization.id}.${platform.currentLocation.id}`
      : apiMode
        ? "pending"
        : "mock";
  const activeScopeRef = useRef(activeScope);
  const resourcesScopeRef = useRef<string | null>(null);
  const loadedResourcesRef = useRef<Set<BusinessResource>>(new Set());
  const [state, setState] = useState<BusinessState>(() =>
    apiMode ? emptyBusinessState(platform) : cloneSeed(),
  );
  const [loadedScope, setLoadedScope] = useState<string | null>(
    apiMode ? null : "mock",
  );
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  useEffect(() => {
    activeScopeRef.current = activeScope;
  }, [activeScope]);

  useEffect(() => {
    if (apiMode && platform) return;
    const timer = window.setTimeout(() => {
      setHydrated(false);
      setState(cloneSeed());
      setLoadedScope("mock");
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [platform]);

  const showToast = useCallback(
    (
      title: string,
      body?: string,
      tone: ToastMessage["tone"] = "success",
    ) => {
      const id = Date.now();
      setToast({ id, title, body, tone });
      window.setTimeout(
        () => setToast((current) => (current?.id === id ? null : current)),
        3600,
      );
    },
    [],
  );

  const refreshBusinessState = useCallback(async () => {
    if (!apiMode || !platform?.ready || platform.offline) return;
    const resources = resourcesForPath(pathname);
    const nextState = await loadBusinessState(
      platform.currentLocation.id,
      platform.bootstrap,
      { resources },
    );
    if (activeScopeRef.current !== activeScope) return;
    loadedResourcesRef.current = new Set(resources);
    setState((current) => mergeBusinessResources(current, nextState, resources));
    setLoadedScope(activeScope);
  }, [activeScope, pathname, platform]);

  useEffect(() => {
    if (!apiMode || !platform?.ready) return;
    if (resourcesScopeRef.current !== activeScope) {
      resourcesScopeRef.current = activeScope;
      loadedResourcesRef.current = new Set();
      setState(emptyBusinessState(platform));
    }
    const resources = (platform.offline ? [] : resourcesForPath(pathname)).filter(
      (resource) => !loadedResourcesRef.current.has(resource),
    );
    if (!resources.length) {
      setLoadedScope(activeScope);
      setHydrated(true);
      return;
    }
    let active = true;
    setHydrated(false);
    void loadBusinessState(platform.currentLocation.id, platform.bootstrap, {
      resources,
    })
      .then((nextState) => {
        if (active && activeScopeRef.current === activeScope) {
          setState((current) =>
            mergeBusinessResources(current, nextState, resources),
          );
          resources.forEach((resource) => loadedResourcesRef.current.add(resource));
          setLoadedScope(activeScope);
          setHydrated(true);
        }
      })
      .catch((error) => {
        if (active && activeScopeRef.current === activeScope) {
          setLoadedScope(activeScope);
          setHydrated(true);
          showToast(
            "Could not load workspace data",
            error instanceof Error ? error.message : "Try refreshing the page.",
            "error",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [activeScope, pathname, platform, showToast]);

  const visibleState = useMemo(
    () =>
      apiMode && loadedScope !== activeScope
        ? emptyBusinessState(platform)
        : state,
    [activeScope, loadedScope, platform, state],
  );
  const visibleHydrated = hydrated && loadedScope === activeScope;

  const addNotification = useCallback(
    (
      draft: Omit<AppNotification, "id" | "createdAt" | "unread">,
    ): AppNotification => ({
      ...draft,
      id: createId("note"),
      createdAt: new Date().toISOString(),
      unread: true,
    }),
    [],
  );

  const upsertProduct = useCallback((product: Product, prepend = false) => {
    setState((current) => {
      const existingIndex = current.products.findIndex(
        (item) => item.id === product.id,
      );
      if (existingIndex >= 0 && !prepend) {
        const products = [...current.products];
        products[existingIndex] = product;
        return { ...current, products };
      }
      const existing = current.products.filter((item) => item.id !== product.id);
      return {
        ...current,
        products: prepend ? [product, ...existing] : [...existing, product],
      };
    });
  }, []);

  const addProduct = useCallback(
    async (input: ProductInput): Promise<boolean> => {
      if (apiMode && platform) {
        try {
          const product = await businessApi.createProduct(
            platform.currentLocation.id,
            input,
          );
          upsertProduct(product, true);
          showToast("Product added", `${input.name} is now in your catalogue.`);
          return true;
        } catch (error) {
          showToast(
            "Could not add product",
            error instanceof Error ? error.message : "Try again.",
            "error",
          );
          return false;
        }
      }
      setState((current) => ({
        ...current,
        products: [
          {
            ...input,
            id: createId("prd"),
            status: "active",
            updatedAt: new Date().toISOString(),
          },
          ...current.products,
        ],
      }));
      showToast("Product added", `${input.name} is now in your catalogue.`);
      return true;
    },
    [platform, showToast, upsertProduct],
  );

  const updateProduct = useCallback(
    async (
      id: string,
      input: ProductInput,
      expectedStock: number,
      expectedVersion?: number,
    ): Promise<boolean> => {
      if (apiMode && platform) {
        try {
          const product = await businessApi.updateProduct(
            platform.currentLocation.id,
            id,
            input,
            expectedStock,
            expectedVersion,
          );
          upsertProduct(product);
          showToast("Product updated", `${input.name} was saved.`);
          return true;
        } catch (error) {
          showToast(
            "Could not update product",
            error instanceof Error ? error.message : "Try again.",
            "error",
          );
          return false;
        }
      }
      setState((current) => ({
        ...current,
        products: current.products.map((product) =>
          product.id === id
            ? {
                ...product,
                ...input,
                updatedAt: new Date().toISOString(),
              }
            : product,
        ),
      }));
      showToast("Product updated", `${input.name} was saved.`);
      return true;
    },
    [platform, showToast, upsertProduct],
  );

  const archiveProduct = useCallback(
    async (product: Product): Promise<boolean> => {
      const id = product.id;
      if (apiMode && platform) {
        const nextStatus =
          product.status === "active" ? "archived" : "active";
        try {
          const updatedProduct = await businessApi.setProductStatus(
            platform.currentLocation.id,
            id,
            nextStatus,
          );
          upsertProduct(updatedProduct);
          showToast("Product status changed");
          return true;
        } catch (error) {
          showToast(
            "Could not change product status",
            error instanceof Error ? error.message : "Try again.",
            "error",
          );
          return false;
        }
      }
      setState((current) => ({
        ...current,
        products: current.products.map((product) =>
          product.id === id
            ? {
                ...product,
                status: product.status === "active" ? "archived" : "active",
                updatedAt: new Date().toISOString(),
              }
            : product,
        ),
      }));
      showToast("Product status changed");
      return true;
    },
    [platform, showToast, upsertProduct],
  );

  const addCustomer = useCallback(
    (input: CustomerInput) => {
      if (apiMode && platform) {
        void businessApi
          .createCustomer(platform.currentLocation.id, input)
          .then(refreshBusinessState)
          .then(() =>
            showToast(
              "Customer added",
              `${input.name} is ready for checkout.`,
            ),
          )
          .catch((error) =>
            showToast(
              "Could not add customer",
              error instanceof Error ? error.message : "Try again.",
              "error",
            ),
          );
        return;
      }
      setState((current) => ({
        ...current,
        customers: [
          {
            ...input,
            id: createId("cus"),
            outstanding: input.outstanding ?? 0,
            totalSpent: 0,
            orders: 0,
            createdAt: new Date().toISOString(),
          },
          ...current.customers,
        ],
      }));
      showToast("Customer added", `${input.name} is ready for checkout.`);
    },
    [platform, refreshBusinessState, showToast],
  );

  const toSaleItems = useCallback(
    (items: CartInput[], products = state.products): SaleItem[] =>
      items.map((cartItem) => {
        const product = products.find(
          (entry) => entry.id === cartItem.productId,
        );
        if (!product) throw new Error("A product in this cart no longer exists.");
        if (cartItem.quantity > product.stock)
          throw new Error(`${product.name} only has ${product.stock} in stock.`);
        return {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          quantity: cartItem.quantity,
          unitPrice: product.price,
          cost: product.cost,
        };
      }),
    [state.products],
  );

  const completeSale = useCallback(
    (input: CompleteSaleInput): Sale => {
      if (apiMode && platform) {
        throw new Error(
          "Connected checkout must be completed from the point-of-sale screen.",
        );
      }
      const items = toSaleItems(input.items);
      const subtotal = items.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0,
      );
      const customer = state.customers.find(
        (entry) => entry.id === input.customerId,
      );
      const sale: Sale = {
        id: `TP-${String(80_500 + state.sales.length).padStart(5, "0")}`,
        customerId: customer?.id,
        customerName: customer?.name ?? "Walk-in customer",
        items,
        subtotal,
        discount: Math.min(input.discount, subtotal),
        total: Math.max(0, subtotal - input.discount),
        paymentMethod: input.paymentMethod,
        status: "completed",
        createdAt: new Date().toISOString(),
        cashier: actorName,
      };

      setState((current) => {
        const soldQuantities = new Map(
          items.map((item) => [item.productId, item.quantity]),
        );
        const products = current.products.map((product) => {
          const sold = soldQuantities.get(product.id) ?? 0;
          return sold
            ? {
                ...product,
                stock: product.stock - sold,
                updatedAt: sale.createdAt,
              }
            : product;
        });
        const newlyLow = products.filter((product) => {
          const before = current.products.find(
            (entry) => entry.id === product.id,
          );
          return (
            soldQuantities.has(product.id) &&
            product.stock <= product.reorderLevel &&
            (before?.stock ?? 0) > before!.reorderLevel
          );
        });
        const notifications = [...current.notifications];
        if (
          current.settings.lowStockNotifications &&
          newlyLow.length > 0
        ) {
          notifications.unshift(
            addNotification({
              title: `${newlyLow.length} product${newlyLow.length > 1 ? "s are" : " is"} running low`,
              body: newlyLow.map((product) => product.name).join(", "),
              tone: "warning",
              href: "/products",
            }),
          );
        }
        return {
          ...current,
          products,
          sales: [sale, ...current.sales],
          customers: current.customers.map((entry) =>
            entry.id === customer?.id
              ? {
                  ...entry,
                  totalSpent: entry.totalSpent + sale.total,
                  orders: entry.orders + 1,
                }
              : entry,
          ),
          notifications,
        };
      });
      showToast(
        "Sale completed",
        `${sale.id} · ${formatCurrency(sale.total)}`,
      );
      return sale;
    },
    [
      addNotification,
      actorName,
      platform,
      showToast,
      state.customers,
      state.sales.length,
      toSaleItems,
    ],
  );

  const recordCompletedSale = useCallback((sale: Sale) => {
    setState((current) => {
      const products = current.products.map((product) => {
        const sold = sale.items
          .filter((item) => item.productId === product.id)
          .reduce((sum, item) => sum + item.quantity, 0);
        return sold ? { ...product, stock: Math.max(0, product.stock - sold) } : product;
      });
      return {
        ...current,
        products,
        sales: [sale, ...current.sales.filter((item) => item.id !== sale.id)],
        customers: current.customers.map((customer) =>
          customer.id === sale.customerId
            ? { ...customer, totalSpent: customer.totalSpent + sale.total, orders: customer.orders + 1 }
            : customer,
        ),
      };
    });
  }, []);

  const holdSale = useCallback(
    (items: CartInput[], customerId?: string, discount = 0) => {
      if (apiMode && platform) {
        throw new Error(
          "Connected held sales must be created from the point-of-sale screen.",
        );
      }
      const held: HeldSale = {
        id: createId("HOLD"),
        items: toSaleItems(items),
        customerId,
        discount,
        createdAt: new Date().toISOString(),
      };
      setState((current) => ({
        ...current,
        heldSales: [held, ...current.heldSales],
      }));
      showToast("Sale held", "You can resume it from the held sales list.", "info");
      return held;
    },
    [platform, showToast, toSaleItems],
  );

  const removeHeldSale = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      heldSales: current.heldSales.filter((sale) => sale.id !== id),
    }));
  }, []);

  const createPurchase = useCallback(
    (input: PurchaseInput) => {
      if (apiMode && platform) {
        void businessApi
          .createPurchase(platform.currentLocation.id, input)
          .then(refreshBusinessState)
          .then(() => showToast("Purchase order created"))
          .catch((error) =>
            showToast(
              "Could not create purchase order",
              error instanceof Error ? error.message : "Try again.",
              "error",
            ),
          );
        return;
      }
      const supplier = state.suppliers.find(
        (entry) => entry.id === input.supplierId,
      );
      const product = state.products.find(
        (entry) => entry.id === input.productId,
      );
      if (!supplier || !product)
        throw new Error("Select a valid supplier and product.");
      const id = `PO-${1030 + state.purchases.length}`;
      setState((current) => ({
        ...current,
        purchases: [
          {
            id,
            supplierId: supplier.id,
            supplierName: supplier.name,
            items: [
              {
                productId: product.id,
                name: product.name,
                quantity: input.quantity,
                unitCost: input.unitCost,
              },
            ],
            total: input.quantity * input.unitCost,
            status: "ordered",
            createdAt: new Date().toISOString(),
            expectedAt: input.expectedAt,
          },
          ...current.purchases,
        ],
      }));
      showToast("Purchase order created", `${id} was sent to ${supplier.name}.`);
    },
    [
      showToast,
      platform,
      refreshBusinessState,
      state.products,
      state.purchases.length,
      state.suppliers,
    ],
  );

  const receivePurchase = useCallback(
    (id: string) => {
      if (apiMode && platform) {
        void businessApi
          .receivePurchase(platform.currentLocation.id, id)
          .then(refreshBusinessState)
          .then(() =>
            showToast(
              "Stock received",
              "Inventory quantities have been updated.",
            ),
          )
          .catch((error) =>
            showToast(
              "Could not receive stock",
              error instanceof Error ? error.message : "Try again.",
              "error",
            ),
          );
        return;
      }
      setState((current) => {
        const purchase = current.purchases.find((entry) => entry.id === id);
        if (!purchase || purchase.status === "received") return current;
        const additions = new Map(
          purchase.items.map((item) => [item.productId, item.quantity]),
        );
        return {
          ...current,
          purchases: current.purchases.map((entry) =>
            entry.id === id ? { ...entry, status: "received" } : entry,
          ),
          products: current.products.map((product) => ({
            ...product,
            stock: product.stock + (additions.get(product.id) ?? 0),
          })),
          notifications: [
            addNotification({
              title: `${id} received`,
              body: `${purchase.items.reduce((sum, item) => sum + item.quantity, 0)} units were added to inventory.`,
              tone: "success",
              href: "/purchases",
            }),
            ...current.notifications,
          ],
        };
      });
      showToast("Stock received", "Inventory quantities have been updated.");
    },
    [addNotification, platform, refreshBusinessState, showToast],
  );

  const createReturn = useCallback(
    (input: ReturnInput) => {
      const sale = state.sales.find((entry) => entry.id === input.saleId);
      if (!sale || !input.items.length) {
        throw new Error("Select at least one valid sale item.");
      }
      const selectedItems = input.items.map((line) => {
        const saleItem = sale.items.find(
          (entry) => entry.productId === line.productId,
        );
        if (!saleItem) throw new Error("Select a valid sale item.");
        if (line.quantity <= 0 || line.quantity > saleItem.quantity) {
          throw new Error(
            `Return quantity for ${saleItem.name} exceeds the original sale.`,
          );
        }
        return { line, saleItem };
      });
      const totalUnits = selectedItems.reduce(
        (sum, item) => sum + item.line.quantity,
        0,
      );
      if (apiMode && platform) {
        if (selectedItems.some(({ saleItem }) => !saleItem.sourceItemId)) {
          showToast(
            "Could not process return",
            "One or more original sale items could not be identified.",
            "error",
          );
          return;
        }
        void businessApi
          .createReturn(
            platform.currentLocation.id,
            sale.sourceId ?? input.saleId,
            input.reason,
            selectedItems.map(({ line, saleItem }) => ({
              saleItemId: saleItem.sourceItemId!,
              quantity: line.quantity,
            })),
          )
          .then(() => {
            const timestamp = new Date().toISOString();
            setState((current) => ({
              ...current,
              returns: [
                ...selectedItems.map(({ line, saleItem }, index) => ({
                  id: `pending-return-${Date.now()}-${index}`,
                  saleId: sale.id,
                  productId: saleItem.productId,
                  itemName: saleItem.name,
                  customerName: sale.customerName,
                  quantity: line.quantity,
                  amount: saleItem.unitPrice * line.quantity,
                  reason: input.reason,
                  status: "approved" as const,
                  createdAt: timestamp,
                })),
                ...current.returns,
              ],
              products: current.products.map((product) => {
                const returned = selectedItems
                  .filter(({ saleItem }) => saleItem.productId === product.id)
                  .reduce((sum, item) => sum + item.line.quantity, 0);
                return returned ? { ...product, stock: product.stock + returned } : product;
              }),
            }));
            showToast("Return approved", `${totalUnits} unit(s) across ${selectedItems.length} item(s) restored to stock.`);
            window.setTimeout(() => void refreshBusinessState(), 300);
          })
          .catch((error) =>
            showToast(
              "Could not process return",
              error instanceof Error ? error.message : "Try again.",
              "error",
            ),
          );
        return;
      }

      setState((current) => ({
        ...current,
        returns: [
          ...selectedItems.map(({ line, saleItem }, index) => ({
            id: `RT-${2041 + current.returns.length}-${index + 1}`,
            saleId: sale.id,
            productId: saleItem.productId,
            itemName: saleItem.name,
            customerName: sale.customerName,
            quantity: line.quantity,
            amount: saleItem.unitPrice * line.quantity,
            reason: input.reason,
            status: "approved" as const,
            createdAt: new Date().toISOString(),
          })),
          ...current.returns,
        ],
        products: current.products.map((product) => {
          const returned = selectedItems
            .filter(({ saleItem }) => saleItem.productId === product.id)
            .reduce((sum, item) => sum + item.line.quantity, 0);
          return returned
            ? { ...product, stock: product.stock + returned }
            : product;
        }),
      }));
      showToast(
        "Return approved",
        `${totalUnits} unit(s) across ${selectedItems.length} item(s) restored to stock.`,
      );
    },
    [platform, refreshBusinessState, showToast, state.sales],
  );

  const addStaff = useCallback(
    async (
      input: StaffInput,
    ): Promise<{ created: boolean; inviteUrl?: string }> => {
      if (apiMode && platform) {
        try {
          const invitation = await businessApi.inviteStaff(
            input,
            platform.currentLocation.id,
          );
          const inviteUrl = new URL("/auth/invite", window.location.origin);
          inviteUrl.searchParams.set(
            "organization",
            platform.bootstrap.organization.slug,
          );
          inviteUrl.searchParams.set("token", invitation.acceptance_token);
          const inviteScope = activeScope;
          void loadBusinessState(platform.currentLocation.id, platform.bootstrap, {
            resources: ["staff"],
          })
            .then((updated) => {
              if (activeScopeRef.current === inviteScope) {
                setState((current) => ({ ...current, staff: updated.staff }));
              }
            })
            .catch(() =>
              showToast(
                "Staff list could not refresh",
                "The invitation was created. Refresh the page to see it in the list.",
                "error",
              ),
            );
          showToast(
            "Invitation created",
            `${input.email} was invited as ${input.role}.`,
          );
          return { created: true, inviteUrl: inviteUrl.toString() };
        } catch (error) {
          showToast(
            "Could not create invitation",
            error instanceof Error ? error.message : "Try again.",
            "error",
          );
          return { created: false };
        }
      }
      setState((current) => ({
        ...current,
        staff: [
          {
            ...input,
            name: input.email.split("@")[0] || "Invited staff",
            phone: "",
            permissions: [],
            id: createId("stf"),
            status: "invited",
            lastActive: new Date().toISOString(),
          },
          ...current.staff,
        ],
      }));
      showToast("Invitation created", `${input.email} was added as ${input.role}.`);
      return { created: true };
    },
    [activeScope, platform, showToast],
  );

  const toggleStaffStatus = useCallback(
    (id: string) => {
      if (apiMode && platform) {
        const member = state.staff.find((item) => item.id === id);
        if (!member || member.role === "Owner") return;
        const nextStatus =
          member.status === "suspended" ? "active" : "suspended";
        void businessApi
          .updateStaffStatus(id, nextStatus)
          .then(refreshBusinessState)
          .then(() => showToast("Staff access updated"))
          .catch((error) =>
            showToast(
              "Could not update staff access",
              error instanceof Error ? error.message : "Try again.",
              "error",
            ),
          );
        return;
      }
      setState((current) => ({
        ...current,
        staff: current.staff.map((staff) =>
          staff.id === id && staff.role !== "Owner"
            ? {
                ...staff,
                status: staff.status === "suspended" ? "active" : "suspended",
              }
            : staff,
        ),
      }));
      showToast("Staff access updated");
    },
    [platform, refreshBusinessState, showToast, state.staff],
  );

  const addExpense = useCallback(
    (input: ExpenseInput) => {
      if (apiMode && platform) {
        const temporaryId = `pending-expense-${Date.now()}`;
        const optimistic = { ...input, id: temporaryId };
        setState((current) => ({ ...current, expenses: [optimistic, ...current.expenses] }));
        void businessApi.createExpense(platform.currentLocation.id, input)
          .then(() => showToast("Expense recorded", `${input.title} was added.`))
          .catch((error) => {
            setState((current) => ({
              ...current,
              expenses: current.expenses.filter((expense) => expense.id !== temporaryId),
            }));
            showToast("Could not record expense", error instanceof Error ? error.message : "Try again.", "error");
          });
        return;
      }
      setState((current) => ({
        ...current,
        expenses: [{ ...input, id: createId("exp") }, ...current.expenses],
      }));
      showToast("Expense recorded", `${input.title} was added.`);
    },
    [platform, showToast],
  );

  const markNotificationRead = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      notifications: current.notifications.map((notification) =>
        notification.id === id
          ? { ...notification, unread: false }
          : notification,
      ),
    }));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setState((current) => ({
      ...current,
      notifications: current.notifications.map((notification) => ({
        ...notification,
        unread: false,
      })),
    }));
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      notifications: current.notifications.filter(
        (notification) => notification.id !== id,
      ),
    }));
  }, []);

  const value = useMemo<BusinessStoreValue>(
    () => ({
      state: visibleState,
      hydrated: visibleHydrated,
      toast,
      addProduct,
      updateProduct,
      archiveProduct,
      addCustomer,
      completeSale,
      recordCompletedSale,
      holdSale,
      removeHeldSale,
      createPurchase,
      receivePurchase,
      createReturn,
      addStaff,
      toggleStaffStatus,
      addExpense,
      markNotificationRead,
      markAllNotificationsRead,
      dismissNotification,
      refresh: refreshBusinessState,
      showToast,
    }),
    [
      visibleState,
      visibleHydrated,
      toast,
      addProduct,
      updateProduct,
      archiveProduct,
      addCustomer,
      completeSale,
      recordCompletedSale,
      holdSale,
      removeHeldSale,
      createPurchase,
      receivePurchase,
      createReturn,
      addStaff,
      toggleStaffStatus,
      addExpense,
      markNotificationRead,
      markAllNotificationsRead,
      dismissNotification,
      refreshBusinessState,
      showToast,
    ],
  );

  return (
    <BusinessStoreContext.Provider value={value}>
      {children}
      {toast && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-[100] w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-[var(--border)] bg-[var(--popover)] p-4 shadow-2xl"
        >
          <div className="flex items-start gap-3">
            <span
              className={`mt-1 size-2.5 shrink-0 rounded-full ${
                toast.tone === "error"
                  ? "bg-red-500"
                  : toast.tone === "info"
                    ? "bg-blue-500"
                    : "bg-emerald-500"
              }`}
            />
            <div>
              <p className="text-sm font-semibold">{toast.title}</p>
              {toast.body && (
                <p className="mt-1 text-xs leading-relaxed text-[var(--muted-foreground)]">
                  {toast.body}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </BusinessStoreContext.Provider>
  );
}

export function useBusinessStore() {
  const context = useContext(BusinessStoreContext);
  if (!context)
    throw new Error(
      "useBusinessStore must be used inside BusinessStoreProvider.",
    );
  return context;
}
