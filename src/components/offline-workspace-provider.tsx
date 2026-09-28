"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { usePlatform } from "@/components/platform-provider";
import { commerceApi, type ApiProduct, type ApiSale } from "@/lib/commerce-api";
import {
  offlineScope,
  offlineStorage,
  type PendingCashSale,
} from "@/lib/offline-storage";
import { PlatformApiError } from "@/lib/platform-api";

interface OfflineWorkspaceValue {
  products: ApiProduct[];
  catalogueComplete: boolean;
  pendingSales: PendingCashSale[];
  connectionOnline: boolean;
  syncedSale: { key: string; sale: ApiSale } | null;
  clearSyncedSale: () => void;
  enqueueCashSale: (sale: PendingCashSale) => Promise<void>;
  syncSales: () => Promise<void>;
  retrySale: (id: string) => Promise<void>;
  refreshCatalogue: (force?: boolean) => Promise<void>;
  rememberProducts: (products: ApiProduct[]) => Promise<void>;
}

const Context = createContext<OfflineWorkspaceValue | null>(null);

export function OfflineWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { bootstrap, currentLocation } = usePlatform();
  const scope = offlineScope(bootstrap.organization.id, currentLocation.id);
  return <OfflineScopeRuntime key={`${scope}.${bootstrap.user.id}`}>{children}</OfflineScopeRuntime>;
}

function OfflineScopeRuntime({ children }: { children: React.ReactNode }) {
  const { bootstrap, currentLocation, offline } = usePlatform();
  const queryClient = useQueryClient();
  const scope = offlineScope(bootstrap.organization.id, currentLocation.id);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [catalogueComplete, setCatalogueComplete] = useState(false);
  const [pendingSales, setPendingSales] = useState<PendingCashSale[]>([]);
  const [connectionOnline, setConnectionOnline] = useState(true);
  const [syncedSale, setSyncedSale] = useState<{ key: string; sale: ApiSale } | null>(null);
  const syncing = useRef(false);
  const loadingCatalogue = useRef<string | null>(null);
  const scopeRef = useRef(scope);

  useEffect(() => {
    scopeRef.current = scope;
    let active = true;
    void Promise.all([
      offlineStorage.getCatalogue(scope),
      offlineStorage.getSales(scope),
    ]).then(([catalogue, sales]) => {
      if (!active) return;
      setProducts(catalogue?.products ?? []);
      setCatalogueComplete(Boolean(catalogue?.complete));
      setPendingSales(sales.filter(
        (sale) => sale.organizationId === bootstrap.organization.id &&
          sale.locationId === currentLocation.id && sale.userId === bootstrap.user.id,
      ));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [scope, bootstrap.organization.id, bootstrap.user.id, currentLocation.id]);

  const refreshCatalogue = useCallback(async (force = false) => {
    if (offline || !navigator.onLine || loadingCatalogue.current === scope) return;
    loadingCatalogue.current = scope;
    const targetScope = scope;
    try {
      const cached = await offlineStorage.getCatalogue(targetScope);
      if (!force && cached?.complete && Date.now() - Date.parse(cached.savedAt) < 5 * 60_000) return;
      const all: ApiProduct[] = [];
      let next = "";
      do {
        const page = await commerceApi.productPage(currentLocation.id, "", next);
        all.push(...page.results);
        next = page.next ?? "";
        if (targetScope === scopeRef.current && all.length === page.results.length) {
          setProducts((current) => current.length ? current : all);
        }
      } while (next);
      await offlineStorage.saveCatalogue(targetScope, {
        products: all, complete: true, savedAt: new Date().toISOString(),
      });
      if (targetScope === scopeRef.current) {
        setProducts(all);
        setCatalogueComplete(true);
      }
    } finally {
      if (loadingCatalogue.current === targetScope) loadingCatalogue.current = null;
    }
  }, [currentLocation.id, offline, scope]);

  const rememberProducts = useCallback(async (pageProducts: ApiProduct[]) => {
    const current = await offlineStorage.getCatalogue(scope);
    if (!pageProducts.length) return;
    const merged = current?.complete
      ? Array.from(new Map([...current.products, ...pageProducts].map((product) => [product.id, product])).values())
      : pageProducts;
    await offlineStorage.saveCatalogue(scope, {
      products: merged,
      complete: Boolean(current?.complete),
      savedAt: current?.savedAt ?? new Date().toISOString(),
    });
    if (scope === scopeRef.current) setProducts(merged);
  }, [scope]);

  const syncSales = useCallback(async () => {
    if (offline || !navigator.onLine || syncing.current) return;
    syncing.current = true;
    const targetScope = scope;
    let syncedAny = false;
    try {
      const sales = await offlineStorage.getSales(targetScope);
      for (const sale of sales) {
        if (sale.status !== "pending") continue;
        if (sale.organizationId !== bootstrap.organization.id ||
            sale.locationId !== currentLocation.id ||
            sale.userId !== bootstrap.user.id) continue;
        try {
          const completed = await commerceApi.checkout(currentLocation.id, {
            items: sale.items,
            customer_id: sale.customerId ?? null,
            discount: sale.discount,
            payment_method: "cash",
          }, sale.id);
          syncedAny = true;
          await offlineStorage.deleteSale(targetScope, sale.id);
          const remaining = await offlineStorage.getSales(targetScope);
          if (targetScope === scopeRef.current) setPendingSales(remaining.filter((item) => item.userId === bootstrap.user.id));
          if (targetScope === scopeRef.current) setSyncedSale({ key: sale.id, sale: completed });
          void queryClient.invalidateQueries({ queryKey: ["dashboard-summary", currentLocation.id] });
          void queryClient.invalidateQueries({ queryKey: ["sales-history", currentLocation.id] });
          void queryClient.invalidateQueries({ queryKey: ["catalog-products", currentLocation.id] });
          void queryClient.invalidateQueries({ queryKey: ["products", currentLocation.id] });
        } catch (error) {
          if (error instanceof PlatformApiError && [400, 403, 404, 409, 422].includes(error.status)) {
            const updatedSale: PendingCashSale = {
              ...sale, status: "needs_review", error: error.message,
            };
            await offlineStorage.saveSale(updatedSale);
            const updated = await offlineStorage.getSales(targetScope);
            if (targetScope === scopeRef.current) setPendingSales(updated.filter((item) => item.userId === bootstrap.user.id));
          }
          // Network failures and server errors remain queued with the same
          // idempotency key. A response may have been lost after server commit.
          if (!(error instanceof PlatformApiError) || error.status >= 500 || error.status === 401) break;
        }
      }
      if (syncedAny) void refreshCatalogue(true).catch(() => undefined);
    } finally {
      syncing.current = false;
    }
  }, [bootstrap.organization.id, bootstrap.user.id, currentLocation.id, offline, queryClient, refreshCatalogue, scope]);

  const enqueueCashSale = useCallback(async (sale: PendingCashSale) => {
    await offlineStorage.saveSale(sale);
    const updated = await offlineStorage.getSales(scope);
    setPendingSales(updated.filter((item) => item.userId === bootstrap.user.id));
    window.setTimeout(() => { void syncSales(); }, 0);
  }, [bootstrap.user.id, scope, syncSales]);

  const retrySale = useCallback(async (id: string) => {
    const latest = await offlineStorage.getSales(scope);
    const sale = latest.find((item) => item.id === id && item.userId === bootstrap.user.id);
    if (!sale) return;
    await offlineStorage.saveSale({ ...sale, status: "pending", error: undefined });
    const updated = await offlineStorage.getSales(scope);
    setPendingSales(updated.filter((item) => item.userId === bootstrap.user.id));
    void syncSales();
  }, [bootstrap.user.id, scope, syncSales]);

  useEffect(() => {
    const update = () => setConnectionOnline(navigator.onLine && !offline);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [offline]);

  useEffect(() => {
    if (!connectionOnline) return;
    void syncSales();
    const interval = window.setInterval(() => { void syncSales(); }, 20_000);
    return () => window.clearInterval(interval);
  }, [connectionOnline, syncSales]);

  return <Context.Provider value={{
    products, catalogueComplete, pendingSales, connectionOnline, syncedSale,
    clearSyncedSale: () => setSyncedSale(null),
    enqueueCashSale, syncSales, retrySale, refreshCatalogue, rememberProducts,
  }}>{children}</Context.Provider>;
}

export function useOfflineWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("useOfflineWorkspace requires OfflineWorkspaceProvider");
  return value;
}
