"use client";

import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import Link from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { mockBootstrap, mockManifest } from "@/lib/mock-platform";
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
  const queryClient = useQueryClient();
  const manifestQuery = useQuery({
    queryKey: ["tenant-manifest"],
    queryFn: () =>
      apiMode ? platformApi.manifest() : Promise.resolve(mockManifest),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const bootstrapQuery = useQuery({
    queryKey: ["tenant-bootstrap"],
    queryFn: () =>
      apiMode ? platformApi.bootstrap() : Promise.resolve(mockBootstrap),
    enabled: Boolean(manifestQuery.data),
    staleTime: 60_000,
    retry: false,
  });
  const manifest = manifestQuery.data ?? mockManifest;
  const bootstrap = bootstrapQuery.data ?? mockBootstrap;
  const locationStorageKey = `saas.location.${bootstrap.organization.id}.${bootstrap.user.id}`;
  const [locationId, setLocationId] = useState(
    bootstrap.locations.find((location) => location.is_primary)?.id ??
      bootstrap.locations[0].id,
  );

  useEffect(() => {
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
  }, [bootstrap.locations, locationStorageKey]);

  useEffect(() => {
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
      const existing =
        document.querySelector<HTMLLinkElement>("link[rel='icon']");
      const favicon = existing ?? document.createElement("link");
      if (!existing) document.head.appendChild(favicon);
      favicon.rel = "icon";
      favicon.href = manifest.branding.favicon_url;
    }
  }, [
    bootstrap.organization.currency,
    bootstrap.organization.locale,
    manifest.branding,
  ]);

  const currentLocation =
    bootstrap.locations.find((location) => location.id === locationId) ??
    bootstrap.locations[0] ??
    mockBootstrap.locations[0];

  const value = useMemo<PlatformContextValue>(
    () => ({
      apiMode,
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
        try {
          if (apiMode) await platformApi.logout();
        } finally {
          queryClient.clear();
          window.location.assign("/auth/login");
        }
      },
    }),
    [bootstrap, currentLocation, locationStorageKey, manifest, queryClient],
  );

  if (apiMode && (manifestQuery.isError || bootstrapQuery.isError)) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--background)] p-6">
        <section className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold">Workspace access required</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Sign in with an active account for this company.
          </p>
          <Button asChild className="mt-5">
            <Link href="/auth/login">Sign in</Link>
          </Button>
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
          queries: { refetchOnWindowFocus: false },
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
