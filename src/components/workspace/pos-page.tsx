"use client";

import {
  Banknote,
  Barcode,
  Check,
  CirclePause,
  CreditCard,
  Minus,
  PackageOpen,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Trash2,
  UserRound,
  WalletCards,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import { useBusinessStore } from "@/components/business-store-provider";
import { usePlatform } from "@/components/platform-provider";
import { useOfflineWorkspace } from "@/components/offline-workspace-provider";
import { TenantLogo } from "@/components/tenant-logo";
import { Button } from "@/components/ui/button";
import type {
  CartInput,
  PaymentMethod,
  Product,
  Sale,
} from "@/lib/business-types";
import { mapApiProduct, mapApiSale } from "@/lib/business-api";
import { commerceApi, type ApiProduct } from "@/lib/commerce-api";
import { offlineScope, offlineStorage } from "@/lib/offline-storage";
import { apiMode } from "@/lib/platform-api";
import { cn, formatCurrency, formatDate, formatTime } from "@/lib/utils";
import {
  FormField,
  inputClass,
  Modal,
  ModalFooter,
  PageHeader,
  Workspace,
} from "@/components/workspace/workspace-ui";

export function PosPage() {
  const queryClient = useQueryClient();
  const {
    products: cachedProducts,
    catalogueComplete,
    pendingSales,
    connectionOnline,
    enqueueSale,
    syncSales,
    retrySale,
    syncedSale,
    clearSyncedSale,
    refreshCatalogue,
  } = useOfflineWorkspace();
  const recentQueuedSaleId = useRef<string | null>(null);
  const {
    state,
    completeSale,
    recordCompletedSale,
    holdSale,
    removeHeldSale,
    showToast,
  } = useBusinessStore();
  const {
    bootstrap,
    currentLocation,
    ready,
  } = usePlatform();
  const [cart, setCart] = useState<CartInput[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [customerId, setCustomerId] = useState("");
  const [discount, setDiscount] = useState(0);
  const [payment, setPayment] = useState<PaymentMethod>("Cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [cashReceived, setCashReceived] = useState(0);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [cartProductCache, setCartProductCache] = useState<Record<string, Product>>({});

  useEffect(() => {
    if (connectionOnline) void refreshCatalogue().catch(() => undefined);
  }, [connectionOnline, refreshCatalogue]);

  useEffect(() => {
    if (!syncedSale || recentQueuedSaleId.current !== syncedSale.key) return;
    const completed = mapApiSale(syncedSale.sale);
    recordCompletedSale(completed);
    setReceipt(completed);
    recentQueuedSaleId.current = null;
    clearSyncedSale();
  }, [clearSyncedSale, recordCompletedSale, syncedSale]);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const productQueryKey = ["products", currentLocation.id, "pos"];

  const apiProductsQuery = useQuery({
    queryKey: productQueryKey,
    queryFn: ({ signal }) =>
      commerceApi.products(currentLocation.id, "", signal),
    // Products are part of the essential workspace bootstrap. Reusing that
    // cache avoids a second catalogue request when opening POS.
    enabled: false,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    placeholderData: (previous) => previous,
  });
  const searchProductsQuery = useQuery({
    queryKey: ["products", currentLocation.id, "pos-search", deferredQuery],
    queryFn: ({ signal }) =>
      commerceApi.products(currentLocation.id, deferredQuery, signal),
    enabled: apiMode && ready && connectionOnline && Boolean(deferredQuery),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
  const apiCustomersQuery = useQuery({
    queryKey: ["customers", currentLocation.id, "pos"],
    queryFn: ({ signal }) =>
      commerceApi.customers(currentLocation.id, signal),
    enabled: apiMode && ready && connectionOnline,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: false,
    placeholderData: (previous) => previous,
  });
  const apiHeldCartsQuery = useQuery({
    queryKey: ["held-carts", currentLocation.id],
    queryFn: ({ signal }) =>
      commerceApi.heldCarts(currentLocation.id, signal),
    enabled: apiMode && ready && connectionOnline,
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    placeholderData: (previous) => previous,
  });
  const availableProducts: Product[] = useMemo(
    () =>
      apiMode
        ? deferredQuery && connectionOnline && searchProductsQuery.data
          ? searchProductsQuery.data.results.map(mapApiProduct)
          : cachedProducts.length
            ? cachedProducts.map(mapApiProduct)
            : apiProductsQuery.data?.results?.map(mapApiProduct) ?? state.products
        : state.products,
    [
      apiProductsQuery.data?.results,
      cachedProducts,
      connectionOnline,
      deferredQuery,
      searchProductsQuery.data,
      state.products,
    ],
  );
  const productsById = useMemo(
    () =>
      new Map(
        [...state.products, ...Object.values(cartProductCache), ...availableProducts].map(
          (product) => [product.id, product],
        ),
      ),
    [availableProducts, cartProductCache, state.products],
  );
  const reservedStock = useMemo(() => {
    const reserved = new Map<string, number>();
    for (const sale of pendingSales) {
      for (const item of sale.items) {
        reserved.set(item.product_id,
          (reserved.get(item.product_id) ?? 0) + Number(item.quantity));
      }
    }
    return reserved;
  }, [pendingSales]);
  const availableStock = (product: Product) =>
    Math.max(0, product.stock - (reservedStock.get(product.id) ?? 0));
  const availableCustomers = useMemo(
    () =>
      apiMode
        ? (apiCustomersQuery.data?.results ?? []).map((customer) => ({
            id: customer.id ?? "",
            name: customer.name ?? "Customer",
          }))
        : state.customers,
    [apiCustomersQuery.data?.results, state.customers],
  );
  const availableHeldSales = useMemo(
    () =>
      apiMode
        ? (apiHeldCartsQuery.data?.results ?? []).map((held) => ({
            id: held.id ?? "",
            customerId: held.customer ?? undefined,
            items: (held.items ?? []) as Sale["items"],
            discount: Number(held.discount ?? 0),
            createdAt: held.created_at ?? new Date().toISOString(),
          }))
        : state.heldSales,
    [apiHeldCartsQuery.data?.results, state.heldSales],
  );

  const categories = useMemo(
    () => [
      "All",
      ...Array.from(
        new Set(availableProducts.map((product) => product.category)),
      ),
    ],
    [availableProducts],
  );
  const products = useMemo(
    () =>
      availableProducts.filter(
        (product) =>
          product.status === "active" &&
          (category === "All" || product.category === category) &&
          [product.name, product.sku, product.barcode]
            .join(" ")
            .toLowerCase()
            .includes(deferredQuery),
      ),
    [availableProducts, category, deferredQuery],
  );

  const cartLines = useMemo(
    () =>
      cart
        .map((item) => {
          const product = productsById.get(item.productId);
          return product ? { ...item, product } : null;
        })
        .filter(Boolean) as Array<CartInput & { product: Product }>,
    [cart, productsById],
  );
  const subtotal = cartLines.reduce(
    (sum, line) => sum + line.product.price * line.quantity,
    0,
  );
  const total = Math.max(0, subtotal - discount);

  const addToCart = (productId: string) => {
    const product = productsById.get(productId);
    if (!product) return;
    if (availableStock(product) < 1) return;
    setCartProductCache((current) => ({ ...current, [productId]: product }));
    setCart((current) => {
      const line = current.find((entry) => entry.productId === productId);
      if (line) {
        if (line.quantity >= availableStock(product)) {
          showToast(
            "Stock limit reached",
            `Only ${availableStock(product)} units are available on this device.`,
            "error",
          );
          return current;
        }
        return current.map((entry) =>
          entry.productId === productId
            ? { ...entry, quantity: entry.quantity + 1 }
            : entry,
        );
      }
      return [...current, { productId, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: string, quantity: number) => {
    const product = productsById.get(productId);
    if (!product) return;
    if (quantity <= 0) {
      setCart((current) =>
        current.filter((entry) => entry.productId !== productId),
      );
      return;
    }
    if (quantity > availableStock(product)) {
      showToast(
        "Stock limit reached",
        `Only ${availableStock(product)} units are available on this device.`,
        "error",
      );
      return;
    }
    setCart((current) =>
      current.map((entry) =>
        entry.productId === productId ? { ...entry, quantity } : entry,
      ),
    );
  };

  const clearCart = () => {
    setCart([]);
    setCartProductCache({});
    setDiscount(0);
    setCustomerId("");
  };

  const holdCurrentSale = async () => {
    if (!cart.length) return;
    if (apiMode) {
      try {
        await commerceApi.createHeldCart(currentLocation.id, {
          customer: customerId || null,
          items: cartLines.map((line) => ({
            productId: line.product.id,
            name: line.product.name,
            sku: line.product.sku,
            quantity: line.quantity,
            unitPrice: line.product.price,
            cost: line.product.cost,
          })),
          discount: String(discount),
        });
        await apiHeldCartsQuery.refetch();
        showToast("Sale held securely", "The cart was saved to your workspace.");
        clearCart();
      } catch (error) {
        showToast(
          "Could not hold sale",
          error instanceof Error ? error.message : "Try again.",
          "error",
        );
      }
      return;
    }
    holdSale(cart, customerId || undefined, discount);
    clearCart();
  };

  const finishSale = async () => {
    setCheckoutBusy(true);
    try {
      if (apiMode && (payment === "Cash" || !connectionOnline)) {
        if (customerId && !connectionOnline) {
          showToast("Customer sale needs connection", "Use a walk-in sale offline, or reconnect before selecting a customer.", "error");
          return;
        }
        const queuedSaleId = crypto.randomUUID();
        await enqueueSale({
          id: queuedSaleId,
          organizationId: bootstrap.organization.id,
          locationId: currentLocation.id,
          userId: bootstrap.user.id,
          createdAt: new Date().toISOString(),
          items: cart.map((item) => ({
            product_id: item.productId,
            quantity: String(item.quantity),
            expected_unit_price: productsById.get(item.productId)?.price.toFixed(2) ?? "0.00",
          })),
          customerId: customerId || null,
          paymentMethod: payment.toLowerCase() as "cash" | "card" | "transfer",
          paymentReference: payment === "Cash" ? "" : paymentReference.trim(),
          discount: String(discount),
          total,
          status: "pending",
        });
        clearCart();
        recentQueuedSaleId.current = queuedSaleId;
        setCheckoutOpen(false);
        setCashReceived(0);
        setPaymentReference("");
        showToast(`${payment} sale saved on this device`, "Pending sync. A final receipt is available after the server accepts the sale.");
        return;
      }
      let sale: Sale;
      if (apiMode) {
        const soldItems = [...cart];
        const result = await commerceApi.checkout(currentLocation.id, {
          items: cart.map((item) => ({
            product_id: item.productId,
            quantity: String(item.quantity),
            expected_unit_price: productsById.get(item.productId)?.price.toFixed(2) ?? "0.00",
          })),
          customer_id: customerId || null,
          discount: String(discount),
          payment_method: payment.toLowerCase() as
            | "cash"
            | "card"
            | "transfer",
          payment_reference: payment === "Cash" ? "" : paymentReference.trim(),
        });
        await offlineStorage.rememberSales(
          offlineScope(bootstrap.organization.id, currentLocation.id),
          bootstrap.user.id,
          [result],
        ).catch(() => undefined);
        sale = {
          sourceId: result.id,
          id: result.number ?? result.id ?? "",
          receiptQrIdentifier: result.receipt_qr_identifier,
          customerId: result.customer ?? undefined,
          customerName: result.customer_name ?? "Walk-in customer",
          items: (result.items ?? []).map((item) => ({
            productId: item.product ?? "",
            name: item.product_name ?? "Product",
            sku: item.sku ?? "",
            barcode: item.barcode ?? "",
            productQrIdentifier: item.product_qr_identifier,
            quantity: Number(item.quantity ?? 0),
            unitPrice: Number(item.unit_price ?? 0),
            cost: Number(item.unit_cost ?? 0),
          })),
          subtotal: Number(result.subtotal ?? 0),
          discount: Number(result.discount ?? 0),
          total: Number(result.total ?? 0),
          paymentMethod: payment,
          status: "completed",
          createdAt:
            result.completed_at ??
            result.created_at ??
            new Date().toISOString(),
          cashier:
            result.cashier_name || bootstrap.user.full_name || "Team member",
        };
        recordCompletedSale(sale);
        const soldQuantities = new Map(
          soldItems.map((item) => [item.productId, item.quantity]),
        );
        queryClient.setQueryData<{ results?: ApiProduct[] }>(
          productQueryKey,
          (current) =>
            current
              ? {
                  ...current,
                  results: current.results?.map((product) => {
                    const sold = soldQuantities.get(product.id ?? "");
                    if (!sold) return product;
                    const nextQuantity = Math.max(
                      0,
                      Number(product.stock_quantity ?? 0) - sold,
                    );
                    return {
                      ...product,
                      stock_quantity: nextQuantity.toFixed(3),
                    };
                  }),
                }
              : current,
        );
        window.setTimeout(() => {
          void Promise.all([
            apiProductsQuery.refetch(),
            queryClient.invalidateQueries({ queryKey: ["notifications"] }),
            queryClient.invalidateQueries({
              queryKey: ["dashboard-summary", currentLocation.id],
            }),
            queryClient.invalidateQueries({
              queryKey: ["sales-history", currentLocation.id],
            }),
            queryClient.invalidateQueries({
              queryKey: ["catalog-products", currentLocation.id],
            }),
            queryClient.invalidateQueries({
              queryKey: ["products", currentLocation.id, "pos-search"],
            }),
          ]).catch(() => undefined);
        }, 250);
      } else {
        sale = completeSale({
          items: cart,
          customerId: customerId || undefined,
          discount,
          paymentMethod: payment,
        });
      }
      setCheckoutOpen(false);
      setReceipt(sale);
      clearCart();
      setCashReceived(0);
      setPaymentReference("");
    } catch (error) {
      if (apiMode && connectionOnline) {
        void refreshCatalogue(true).catch(() => undefined);
        void queryClient.invalidateQueries({ queryKey: ["products", currentLocation.id, "pos-search"] });
      }
      showToast(
        "Checkout could not complete",
        error instanceof Error ? error.message : "Check the cart and try again.",
        "error",
      );
    } finally {
      setCheckoutBusy(false);
    }
  };

  const resumeHeld = async (id: string) => {
    const held = availableHeldSales.find((sale) => sale.id === id);
    if (!held) return;
    if (apiMode) {
      try {
        const heldProducts = await Promise.all(
          held.items.map(async (item) =>
            productsById.get(item.productId) ??
            mapApiProduct(
              await commerceApi.productById(currentLocation.id, item.productId),
            ),
          ),
        );
        setCartProductCache(
          Object.fromEntries(heldProducts.map((product) => [product.id, product])),
        );
      } catch (error) {
        showToast(
          "Could not resume held sale",
          error instanceof Error ? error.message : "Try again.",
          "error",
        );
        return;
      }
    }
    setCart(
      held.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    );
    setCustomerId(held.customerId ?? "");
    setDiscount(held.discount);
    if (!apiMode) {
      removeHeldSale(id);
    } else {
      void commerceApi
        .deleteHeldCart(currentLocation.id, id)
        .then(() => apiHeldCartsQuery.refetch())
        .catch((error) =>
          showToast(
            "Held sale resumed, but its saved copy could not be cleared",
            error instanceof Error ? error.message : "Try again later.",
            "error",
          ),
        );
    }
    setHeldOpen(false);
    showToast("Held sale resumed", undefined, "info");
  };

  return (
    <Workspace>
      <PageHeader
        eyebrow="Checkout"
        title="Point of sale"
        description="A fast, keyboard-friendly checkout with live stock validation and consistent records."
        actions={
          <Button variant="secondary" disabled={apiMode && !connectionOnline} onClick={() => setHeldOpen(true)}>
            <CirclePause className="size-4" />
            Held sales
            {availableHeldSales.length > 0 && (
              <span className="rounded-full bg-[var(--primary-soft)] px-1.5 py-0.5 text-[10px] text-[var(--primary-soft-foreground)]">
                {availableHeldSales.length}
              </span>
            )}
          </Button>
        }
      />

      {apiMode && pendingSales.length > 0 && (
        <section className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{pendingSales.length} sale{pendingSales.length === 1 ? "" : "s"} saved on this device</p>
              <p className="text-xs text-[var(--muted-foreground)]">These are not final receipts until synced and accepted.</p>
            </div>
            <Button type="button" variant="secondary" disabled={!connectionOnline} onClick={() => void syncSales()}>Sync now</Button>
          </div>
          <div className="mt-3 space-y-2 text-xs">
            {pendingSales.map((sale) => (
              <div key={sale.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>{new Date(sale.createdAt).toLocaleString()} · {(sale.paymentMethod ?? "cash").toUpperCase()} · {formatCurrency(sale.total)}{sale.paymentReference ? ` · Ref ${sale.paymentReference}` : ""} · {sale.status === "needs_review" ? `Needs review: ${sale.error}` : "Pending sync"}</span>
                {sale.status === "needs_review" && <Button type="button" variant="secondary" onClick={() => void retrySale(sale.id)}>Retry</Button>}
              </div>
            ))}
          </div>
        </section>
      )}

      {apiMode && !connectionOnline && (
        <p role="status" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
          Offline sales are saved on this device until sync. Confirm card and transfer payments outside Workcrest before saving. {catalogueComplete
            ? "Prices and stock are from the last saved catalogue."
            : "The full catalogue was not downloaded before this outage; only saved products are available."}
        </p>
      )}
      {apiMode && connectionOnline && !catalogueComplete && (
        <p role="status" className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--muted-foreground)]">
          Preparing the product catalogue for offline use. Keep this page open until it finishes.
        </p>
      )}

      <div className="grid min-h-[calc(100vh-190px)] gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="min-w-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="border-b border-[var(--border)] p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                autoFocus
                placeholder="Search product name, SKU, or scan barcode"
                className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] pl-10 pr-11 text-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-soft)]"
              />
              <Barcode className="absolute right-3 top-1/2 size-5 -translate-y-1/2 text-[var(--muted-foreground)]" />
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {categories.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCategory(item)}
                  className={cn(
                    "h-8 shrink-0 rounded-lg px-3 text-[11px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                    category === item
                      ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                      : "bg-[var(--surface-subtle)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {apiMode && deferredQuery && connectionOnline && searchProductsQuery.isPending && !availableProducts.length ? (
            <div role="status" className="p-6 text-sm text-[var(--muted-foreground)]">
              Searching products…
            </div>
          ) : apiMode && deferredQuery && connectionOnline && searchProductsQuery.isError && !availableProducts.length ? (
            <div role="alert" className="p-6 text-sm">
              <p>Product search failed.</p>
              <Button
                className="mt-3"
                variant="secondary"
                onClick={() => void searchProductsQuery.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : products.length ? (
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  disabled={availableStock(product) === 0}
                  onClick={() => addToCart(product.id)}
                  className="group min-h-36 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left outline-none transition hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-md focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <span className="grid size-9 place-items-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary-soft-foreground)]">
                    <PackageOpen className="size-[18px]" />
                  </span>
                  <p className="mt-3 line-clamp-2 text-xs font-semibold leading-snug">
                    {product.name}
                  </p>
                  <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                    {availableStock(product) === 0
                      ? "Out of stock"
                      : `${availableStock(product)} available`}
                  </p>
                  <p className="mt-2 text-sm font-bold">
                    {formatCurrency(product.price)}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <div className="grid min-h-80 place-items-center text-center">
              <div>
                <PackageOpen className="mx-auto size-8 text-[var(--muted-foreground)]" />
                <p className="mt-3 text-sm font-semibold">No matching products</p>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  Try another name, SKU, or category.
                </p>
              </div>
            </div>
          )}
        </section>

        <aside className="flex min-h-[620px] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--card-shadow)] xl:sticky xl:top-[92px] xl:max-h-[calc(100vh-112px)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5">
            <div className="flex items-center gap-2">
              <ShoppingCart className="size-4 text-[var(--primary-soft-foreground)]" />
              <h2 className="text-sm font-bold">Current sale</h2>
              <span className="text-[10px] text-[var(--muted-foreground)]">
                {cart.reduce((sum, item) => sum + item.quantity, 0)} items
              </span>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={clearCart}
                className="text-[10px] font-semibold text-red-600 hover:underline dark:text-red-400"
              >
                Clear
              </button>
            )}
          </div>

          <div className="border-b border-[var(--border)] p-3">
            <label className="relative block">
              <UserRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
              <select
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
                className="h-10 w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--background)] pl-9 pr-3 text-xs outline-none focus:border-[var(--primary)]"
              >
                <option value="">Walk-in customer</option>
                {availableCustomers.map((customer) => (
                  <option value={customer.id} key={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {cartLines.length ? (
              <div className="divide-y divide-[var(--border)]">
                {cartLines.map((line) => (
                  <div key={line.productId} className="p-3.5">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold">
                          {line.product.name}
                        </p>
                        <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                          {formatCurrency(line.product.price)} each
                        </p>
                      </div>
                      <p className="text-xs font-bold">
                        {formatCurrency(line.product.price * line.quantity)}
                      </p>
                    </div>
                    <div className="mt-3 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          updateQuantity(line.productId, line.quantity - 1)
                        }
                        className="grid size-7 place-items-center rounded-md border border-[var(--border)] hover:bg-[var(--surface-hover)]"
                      >
                        <Minus className="size-3" />
                      </button>
                      <input
                        type="number"
                        min="1"
                        max={line.product.stock}
                        value={line.quantity}
                        onChange={(event) =>
                          updateQuantity(
                            line.productId,
                            Number(event.target.value),
                          )
                        }
                        aria-label={`Quantity for ${line.product.name}`}
                        className="h-7 w-11 rounded-md border border-[var(--border)] bg-[var(--background)] text-center text-xs font-semibold outline-none"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateQuantity(line.productId, line.quantity + 1)
                        }
                        className="grid size-7 place-items-center rounded-md border border-[var(--border)] hover:bg-[var(--surface-hover)]"
                      >
                        <Plus className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => updateQuantity(line.productId, 0)}
                        className="ml-auto grid size-7 place-items-center rounded-md text-red-500 hover:bg-red-500/10"
                        aria-label={`Remove ${line.product.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid h-full min-h-52 place-items-center px-6 text-center">
                <div>
                  <ShoppingCart className="mx-auto size-8 text-[var(--muted-foreground)]" />
                  <p className="mt-3 text-sm font-semibold">Cart is empty</p>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    Select a product to begin this sale.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-[var(--border)] bg-[var(--surface-subtle)] p-4">
            <label className="flex items-center justify-between gap-3 text-xs">
              <span className="text-[var(--muted-foreground)]">Discount</span>
              <span className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-[var(--muted-foreground)]">
                  ₦
                </span>
                <input
                  type="number"
                  min="0"
                  max={subtotal}
                  value={discount || ""}
                  onChange={(event) =>
                    setDiscount(Math.max(0, Number(event.target.value)))
                  }
                  placeholder="0"
                  className="h-8 w-28 rounded-md border border-[var(--border)] bg-[var(--surface)] pl-6 pr-2 text-right text-xs outline-none focus:border-[var(--primary)]"
                />
              </span>
            </label>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between text-[var(--muted-foreground)]">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                  <span>Discount</span>
                  <span>-{formatCurrency(discount)}</span>
                </div>
              )}
              <div className="flex items-end justify-between border-t border-[var(--border)] pt-3">
                <span className="font-semibold">Total</span>
                <span className="text-xl font-bold tracking-[-0.03em]">
                  {formatCurrency(total)}
                </span>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-[auto_1fr] gap-2">
              <Button
                variant="secondary"
                size="icon"
                disabled={!cart.length || (apiMode && !connectionOnline)}
                onClick={holdCurrentSale}
                aria-label="Hold current sale"
              >
                <CirclePause className="size-4" />
              </Button>
              <Button
                disabled={!cart.length}
                onClick={() => {
                  setCashReceived(total);
                  setCheckoutOpen(true);
                }}
              >
                Checkout · {formatCurrency(total)}
              </Button>
            </div>
          </div>
        </aside>
      </div>

      <Modal
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        title="Take payment"
        description={apiMode && (payment === "Cash" || !connectionOnline)
          ? "Save this sale on the device. It becomes final when the server accepts it."
          : "Confirm the payment method and amount before completing this sale."}
      >
        <div className="p-5">
          <div className="rounded-xl bg-[var(--primary-soft)] p-4 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--primary-soft-foreground)]">
              Amount due
            </p>
            <p className="mt-2 text-3xl font-bold tracking-[-0.04em]">
              {formatCurrency(total)}
            </p>
          </div>
          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold">Payment method</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "Cash" as const, icon: Banknote },
                { value: "Card" as const, icon: CreditCard },
                { value: "Transfer" as const, icon: WalletCards },
              ].map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPayment(option.value)}
                    className={cn(
                      "relative rounded-xl border p-3 text-center outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                      payment === option.value
                        ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-soft-foreground)]"
                        : "border-[var(--border)] hover:bg-[var(--surface-hover)]",
                    )}
                  >
                    {payment === option.value && (
                      <Check className="absolute right-2 top-2 size-3.5" />
                    )}
                    <Icon className="mx-auto size-5" />
                    <span className="mt-2 block text-[11px] font-semibold">
                      {option.value}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          {payment === "Cash" && (
            <FormField label="Cash received" className="mt-5">
              <input
                type="number"
                min={total}
                value={cashReceived || ""}
                onChange={(event) =>
                  setCashReceived(Number(event.target.value))
                }
                className={inputClass}
              />
              <span className="mt-2 flex justify-between rounded-lg bg-[var(--surface-subtle)] px-3 py-2 text-xs">
                <span className="text-[var(--muted-foreground)]">Change</span>
                <strong>{formatCurrency(Math.max(0, cashReceived - total))}</strong>
              </span>
            </FormField>
          )}
          {payment !== "Cash" && (
            <div className="mt-5 space-y-3">
              <p className="text-xs text-[var(--muted-foreground)]">
                Confirm payment on your card terminal or banking app before saving. Workcrest records the payment; it does not charge or verify it.
              </p>
              <FormField label="Payment reference (optional)">
                <input
                  type="text"
                  maxLength={100}
                  value={paymentReference}
                  onChange={(event) => setPaymentReference(event.target.value)}
                  className={inputClass}
                />
              </FormField>
            </div>
          )}
        </div>
        <ModalFooter>
          <Button
            variant="secondary"
            onClick={() => setCheckoutOpen(false)}
          >
            Back
          </Button>
          <Button
            onClick={finishSale}
            disabled={
              checkoutBusy ||
              (payment === "Cash" && cashReceived < total)
            }
          >
            <Check className="size-4" />{" "}
            {checkoutBusy ? "Saving…" : apiMode && (payment === "Cash" || !connectionOnline) ? "Save sale" : "Complete sale"}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        open={heldOpen}
        onOpenChange={setHeldOpen}
        title="Held sales"
        description="Resume a paused sale without losing its customer or discount."
      >
        <div className="divide-y divide-[var(--border)]">
          {availableHeldSales.length ? (
            availableHeldSales.map((held) => {
              const heldTotal =
                held.items.reduce(
                  (sum, item) => sum + item.unitPrice * item.quantity,
                  0,
                ) - held.discount;
              return (
                <div
                  key={held.id}
                  className="flex items-center gap-3 px-5 py-4"
                >
                  <span className="grid size-9 place-items-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary-soft-foreground)]">
                    <CirclePause className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold">{held.id}</p>
                    <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                      {held.items.reduce(
                        (sum, item) => sum + item.quantity,
                        0,
                      )}{" "}
                      items · {formatTime(held.createdAt)}
                    </p>
                  </div>
                  <p className="text-xs font-bold">{formatCurrency(heldTotal)}</p>
                  <Button size="sm" onClick={() => resumeHeld(held.id)}>
                    Resume
                  </Button>
                </div>
              );
            })
          ) : (
            <div className="grid min-h-56 place-items-center text-center">
              <div>
                <CirclePause className="mx-auto size-7 text-[var(--muted-foreground)]" />
                <p className="mt-3 text-sm font-semibold">No held sales</p>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  Paused carts will appear here.
                </p>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={Boolean(receipt)}
        onOpenChange={(open) => !open && setReceipt(null)}
        title="Sale complete"
        description="Payment was recorded and inventory has been updated."
        size="sm"
      >
        {receipt && (
          <>
            <div id="printable-receipt" className="p-5">
              <div className="text-center">
                <TenantLogo
                  src={bootstrap.branding.logo_url}
                  alt={`${bootstrap.branding.display_name} logo`}
                  className="mx-auto size-14 place-items-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  fallback={
                  <span className="mx-auto grid size-11 place-items-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <Check className="size-5" />
                  </span>
                  }
                />
                <p className="mt-3 text-base font-bold">
                  {bootstrap.branding.display_name}
                </p>
                <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                  {Object.values(currentLocation.address)
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>
              <div className="my-5 border-y border-dashed border-[var(--border)] py-3 text-[10px] text-[var(--muted-foreground)]">
                <div className="flex justify-between">
                  <span>Receipt</span>
                  <strong className="text-[var(--foreground)]">{receipt.id}</strong>
                </div>
                <div className="mt-1 flex justify-between">
                  <span>Date</span>
                  <span>
                    {formatDate(new Date(receipt.createdAt))} ·{" "}
                    {formatTime(receipt.createdAt)}
                  </span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span>Customer</span>
                  <span>{receipt.customerName}</span>
                </div>
              </div>
              <div className="space-y-3">
                {receipt.items.map((item) => (
                  <div key={item.productId} className="flex gap-3 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{item.name}</p>
                      <p className="mt-0.5 text-[9px] text-[var(--muted-foreground)]">
                        SKU {item.sku} · Barcode {item.barcode || "Nil"}
                      </p>
                      <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
                        {item.quantity} × {formatCurrency(item.unitPrice)}
                      </p>
                    </div>
                    <strong>
                      {formatCurrency(item.quantity * item.unitPrice)}
                    </strong>
                  </div>
                ))}
              </div>
              <div className="mt-5 space-y-2 border-t border-dashed border-[var(--border)] pt-3 text-xs">
                <div className="flex justify-between text-[var(--muted-foreground)]">
                  <span>Subtotal</span>
                  <span>{formatCurrency(receipt.subtotal)}</span>
                </div>
                {receipt.discount > 0 && (
                  <div className="flex justify-between text-[var(--muted-foreground)]">
                    <span>Discount</span>
                    <span>-{formatCurrency(receipt.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-1 text-base font-bold">
                  <span>Total</span>
                  <span>{formatCurrency(receipt.total)}</span>
                </div>
                <div className="flex justify-between text-[10px] text-[var(--muted-foreground)]">
                  <span>Paid via</span>
                  <span>{receipt.paymentMethod}</span>
                </div>
              </div>
              <div className="mt-5 border-t border-dashed border-[var(--border)] pt-4 text-center">
                <div className="mx-auto w-fit rounded-lg bg-white p-2">
                  <QRCodeSVG
                    value={`${window.location.origin}/sales?receipt=${encodeURIComponent(
                      receipt.receiptQrIdentifier ??
                        receipt.sourceId ??
                        receipt.id,
                    )}`}
                    size={112}
                    level="M"
                    aria-label={`QR code for receipt ${receipt.id}`}
                  />
                </div>
                <p className="mx-auto mt-2 max-w-52 text-[9px] leading-4 text-[var(--muted-foreground)]">
                  Scan to retrieve this sale and its product information for
                  returns, exchanges, or warranty claims.
                </p>
              </div>
              <p className="mt-6 text-center text-[10px] text-[var(--muted-foreground)]">
                {bootstrap.branding.receipt_footer ||
                  "Thank you for shopping with us."}
              </p>
            </div>
            <ModalFooter>
              <Button variant="secondary" onClick={() => setReceipt(null)}>
                Done
              </Button>
              <Button onClick={() => window.print()}>
                <Printer className="size-4" /> Print receipt
              </Button>
            </ModalFooter>
          </>
        )}
      </Modal>
    </Workspace>
  );
}
