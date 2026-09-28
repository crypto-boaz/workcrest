"use client";

import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { mockBootstrap, mockManifest } from "@/lib/mock-platform";
import { offlineStorage } from "@/lib/offline-storage";
import { apiMode, platformApi } from "@/lib/platform-api";
import type {
  CompanySettingsResponse,
  TenantBootstrap,
  TenantLocation,
  TenantManifest,
} from "@/lib/platform-types";
import { configureFormatting } from "@/lib/utils";

interface PlatformContextValue {
  apiMode: boolean;
  offline: boolean;
  ready: boolean;
  manifest: TenantManifest;
  bootstrap: TenantBootstrap;
  currentLocation: TenantLocation;
  setCurrentLocation: (locationId: string) => void;
  storageNamespace: string;
  moduleEnabled: (code: string) => boolean;
  applyCompanySettings: (settings: CompanySettingsResponse) => void;
  signOut: () => Promise<void>;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

function brandForeground(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((value) => Number.parseInt(value, 16) / 255);
  if (!channels || channels.some(Number.isNaN)) return "#FFFFFF";
  const [red, green, blue] = channels.map((value) =>
    value <= 0.04045
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4),
  );
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  const whiteContrast = 1.05 / (luminance + 0.05);
  const darkContrast = (luminance + 0.05) / 0.056;
  return darkContrast > whiteContrast ? "#0B1220" : "#FFFFFF";
}

function PlatformRuntime({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [offline, setOffline] = useState(false);
  const [offlineUnlocked, setOfflineUnlocked] = useState(false);
  const [offlineProblem, setOfflineProblem] = useState<"missing_identity" | "missing_pin" | null>(null);
  const [offlinePin, setOfflinePin] = useState("");
  const [offlinePinError, setOfflinePinError] = useState("");
  const manifestQuery = useQuery({
    queryKey: ["tenant-manifest"],
    queryFn: async () => {
      if (!apiMode) return mockManifest;
      try {
        return await platformApi.manifest();
      } catch (error) {
        if (navigator.onLine && !(error instanceof TypeError)) throw error;
        const cached = await offlineStorage.getIdentity();
        const pin = await offlineStorage.getPin();
        setOffline(true);
        setOfflineProblem(!cached ? "missing_identity" : !pin ? "missing_pin" : null);
        if (!cached || !pin) throw error;
        return cached.manifest;
      }
    },
    staleTime: 5 * 60_000,
    retry: 1,
    networkMode: "always",
  });
  const bootstrapQuery = useQuery({
    queryKey: ["tenant-bootstrap"],
    queryFn: async () => {
      if (!apiMode) return mockBootstrap;
      try {
        return await platformApi.bootstrap();
      } catch (error) {
        if (navigator.onLine && !(error instanceof TypeError)) throw error;
        const cached = await offlineStorage.getIdentity();
        const pin = await offlineStorage.getPin();
        setOffline(true);
        setOfflineProblem(!cached ? "missing_identity" : !pin ? "missing_pin" : null);
        if (!cached || !pin) throw error;
        return cached.bootstrap;
      }
    },
    staleTime: 60_000,
    retry: false,
    networkMode: "always",
  });
  const manifest = manifestQuery.data ?? mockManifest;
  const bootstrap = bootstrapQuery.data ?? mockBootstrap;
  const ready =
    !apiMode || Boolean(manifestQuery.data && bootstrapQuery.data);
  useEffect(() => {
    if (!apiMode || !manifestQuery.data || !bootstrapQuery.data || offline) return;
    if (bootstrapQuery.data.support_session) return;
    if (manifestQuery.data.organization.slug !== bootstrapQuery.data.organization.slug) return;
    void offlineStorage.saveIdentity({
      manifest: manifestQuery.data,
      bootstrap: bootstrapQuery.data,
      savedAt: new Date().toISOString(),
    }).catch(() => undefined);
  }, [bootstrapQuery.data, manifestQuery.data, offline]);

  useEffect(() => {
    const onOffline = () => {
      if (!apiMode || !manifestQuery.data || !bootstrapQuery.data) return;
      setOffline(true);
      setOfflineUnlocked(false);
      void Promise.all([offlineStorage.getIdentity(), offlineStorage.getPin()])
        .then(([identity, pin]) => {
          setOfflineProblem(!identity ? "missing_identity" : !pin ? "missing_pin" : null);
        })
        .catch(() => setOfflineProblem("missing_identity"));
    };
    const onOnline = () => {
      void Promise.all([platformApi.manifest(), platformApi.bootstrap()])
        .then(([nextManifest, nextBootstrap]) => {
          queryClient.setQueryData(["tenant-manifest"], nextManifest);
          queryClient.setQueryData(["tenant-bootstrap"], nextBootstrap);
          setOffline(false);
          setOfflineUnlocked(false);
          setOfflineProblem(null);
        }).catch(() => undefined);
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [bootstrapQuery.data, manifestQuery.data, queryClient]);
  const locationStorageKey = `saas.location.${bootstrap.organization.id}.${bootstrap.user.id}`;
  const [locationId, setLocationId] = useState(
    bootstrap.locations.find((location) => location.is_primary)?.id ??
      bootstrap.locations[0].id,
  );

  useEffect(() => {
    if (!ready) return;

    const timer = window.setTimeout(() => {
      const stored = window.localStorage.getItem(locationStorageKey);
      if (
        stored &&
        bootstrap.locations.some((location) => location.id === stored)
      ) {
        setLocationId(stored);
      } else {
        setLocationId(
          bootstrap.locations.find((location) => location.is_primary)?.id ??
            bootstrap.locations[0].id,
        );
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [bootstrap.locations, locationStorageKey, ready]);

  useEffect(() => {
    if (!ready) return;

    const root = document.documentElement;
    configureFormatting({
      locale: bootstrap.organization.locale,
      currency: bootstrap.organization.currency,
    });
    root.style.setProperty("--primary", manifest.branding.primary_color);
    root.style.setProperty(
      "--primary-foreground",
      brandForeground(manifest.branding.primary_color),
    );
    root.style.setProperty(
      "--primary-hover",
      `color-mix(in srgb, ${manifest.branding.primary_color} 82%, black)`,
    );
    root.style.setProperty(
      "--primary-soft",
      `color-mix(in srgb, ${manifest.branding.primary_color} 14%, var(--background))`,
    );
    root.style.setProperty(
      "--primary-soft-foreground",
      `color-mix(in srgb, ${manifest.branding.primary_color} 78%, black)`,
    );
    root.style.setProperty("--ring", manifest.branding.primary_color);
    root.style.setProperty("--chart", manifest.branding.primary_color);
    root.style.setProperty("--sidebar-active", manifest.branding.primary_color);
    root.style.setProperty("--tenant-accent", manifest.branding.accent_color);
    document.title = `${manifest.branding.display_name} · Business operations`;
    if (manifest.branding.favicon_url) {
      document.querySelectorAll<HTMLLinkElement>("link[rel='icon']").forEach((favicon) => {
        favicon.href = manifest.branding.favicon_url;
      });
    }
  }, [
    bootstrap.organization.currency,
    bootstrap.organization.locale,
    manifest.branding,
    ready,
  ]);

  const currentLocation =
    bootstrap.locations.find((location) => location.id === locationId) ??
    bootstrap.locations[0] ??
    mockBootstrap.locations[0];

  const value = useMemo<PlatformContextValue>(
    () => ({
      apiMode,
      offline,
      ready,
      manifest,
      bootstrap,
      currentLocation,
      setCurrentLocation: (nextLocationId) => {
        setLocationId(nextLocationId);
        window.localStorage.setItem(locationStorageKey, nextLocationId);
      },
      storageNamespace: [
        bootstrap.organization.id,
        bootstrap.user.id,
        currentLocation.id,
      ].join("."),
      moduleEnabled: (code) =>
        bootstrap.modules.some(
          (module) => module.code === code && module.status !== "disabled",
        ),
      applyCompanySettings: (settings) => {
        queryClient.setQueryData<TenantBootstrap>(
          ["tenant-bootstrap"],
          (current) => {
            if (!current) return current;
            return {
              ...current,
              organization: settings.organization,
              branding: settings.branding,
              locations: current.locations.map((location) =>
                location.id === settings.primary_location.id
                  ? settings.primary_location
                  : location,
              ),
            };
          },
        );
        queryClient.setQueryData<TenantManifest>(
          ["tenant-manifest"],
          (current) => {
            if (!current) return current;
            return {
              organization: {
                slug: settings.organization.slug,
                industry_code: settings.organization.industry_code,
                locale: settings.organization.locale,
                currency: settings.organization.currency,
              },
              branding: settings.branding,
            };
          },
        );
      },
      signOut: async () => {
        if (apiMode && (offline || !navigator.onLine)) return;
        if (apiMode) {
          try {
            await platformApi.logout();
          } catch {
            window.alert("Could not sign out. Reconnect and try again; offline sales are still saved on this device.");
            return;
          }
        }
        await offlineStorage.clearIdentity();
        await offlineStorage.clearPin();
        queryClient.clear();
        window.location.assign("/auth/login");
      },
    }),
    [
      bootstrap,
      currentLocation,
      locationStorageKey,
      manifest,
      offline,
      queryClient,
      ready,
    ],
  );

  if (apiMode && (manifestQuery.isError || bootstrapQuery.isError)) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--background)] p-6">
        <section className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold">{offline ? "Offline access is not ready" : "Workspace access required"}</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            {offlineProblem === "missing_pin"
              ? "This device has no offline PIN. Reconnect, sign in, and set one in Settings before going offline."
              : offlineProblem === "missing_identity"
                ? "No workspace was saved on this device. Reconnect and sign in once to prepare offline access."
                : "Sign in with an active account for this company."}
          </p>
          {!offline && <Button asChild className="mt-5"><Link href="/auth/login">Sign in</Link></Button>}
        </section>
      </main>
    );
  }

  if (apiMode && !ready) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--background)] p-6">
        <div
          aria-live="polite"
          className="flex items-center gap-3 text-sm text-[var(--muted-foreground)]"
          role="status"
        >
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-[var(--muted)] border-t-[var(--primary)]"
          />
          Loading your workspace…
        </div>
      </main>
    );
  }

  if (apiMode && offline && offlineProblem) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--background)] p-6">
        <section className="w-full max-w-sm space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <h1 className="text-lg font-semibold">Offline access is not ready</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            {offlineProblem === "missing_pin"
              ? "Reconnect, sign in, and set an offline PIN in Settings. Your saved sales remain on this device."
              : "Reconnect and sign in once to save this workspace on the device."}
          </p>
        </section>
      </main>
    );
  }

  if (apiMode && offline && !offlineUnlocked) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--background)] p-6">
        <form className="w-full max-w-sm space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6"
          onSubmit={(event) => {
            event.preventDefault();
            void offlineStorage.verifyPin(offlinePin).then((valid) => {
              if (valid) {
                setOfflineUnlocked(true);
                setOfflinePin("");
                setOfflinePinError("");
              } else setOfflinePinError("Incorrect offline PIN.");
            }).catch(() => setOfflinePinError("Offline storage could not be unlocked on this device."));
          }}>
          <h1 className="text-lg font-semibold">Unlock offline workspace</h1>
          <p className="text-sm text-[var(--muted-foreground)]">Enter the PIN set on this device. Sales remain pending until the server accepts them.</p>
          <input type="password" autoComplete="off" inputMode="numeric" value={offlinePin}
            onChange={(event) => setOfflinePin(event.target.value)}
            aria-label="Offline PIN"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-3" />
          {offlinePinError && <p role="alert" className="text-sm text-red-600">{offlinePinError}</p>}
          <Button type="submit">Unlock</Button>
        </form>
      </main>
    );
  }

  if (apiMode && offline && !["/pos", "/products", "/sales"].includes(pathname)) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--background)] p-6">
        <section className="space-y-3 text-center">
          <h1 className="text-lg font-semibold">This page needs a connection</h1>
          <p className="text-sm text-[var(--muted-foreground)]">Products, Sales, and Point of sale are available offline.</p>
          <Button asChild><Link href="/pos">Open point of sale</Link></Button>
        </section>
      </main>
    );
  }

  return (
    <PlatformContext.Provider value={value}>
      {children}
    </PlatformContext.Provider>
  );
}

export function PlatformProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 30_000,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <PlatformRuntime>{children}</PlatformRuntime>
    </QueryClientProvider>
  );
}

export function usePlatform() {
  const context = useContext(PlatformContext);
  if (!context) {
    throw new Error("usePlatform must be used inside PlatformProvider.");
  }
  return context;
}

export function useOptionalPlatform() {
  return useContext(PlatformContext);
}
