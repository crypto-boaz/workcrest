"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ShieldAlert, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { AppHeader } from "@/components/app-header";
import { CommandSearch } from "@/components/command-search";
import { usePlatform } from "@/components/platform-provider";
import { SidebarContent } from "@/components/sidebar-content";
import { cn } from "@/lib/utils";
import { offlineStorage } from "@/lib/offline-storage";
import { apiMode } from "@/lib/platform-api";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { bootstrap, offline } = usePlatform();
  const sidebarStorageKey = `saas.sidebar.${bootstrap.organization.id}`;
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [offlinePinReady, setOfflinePinReady] = useState<boolean | null>(null);

  useEffect(() => {
    if (!apiMode) return;
    let active = true;
    const refreshPin = () => {
      void offlineStorage.getPin()
        .then((pin) => { if (active) setOfflinePinReady(Boolean(pin)); })
        .catch(() => { if (active) setOfflinePinReady(false); });
    };
    refreshPin();
    window.addEventListener("workcrest-offline-pin-set", refreshPin);
    return () => {
      active = false;
      window.removeEventListener("workcrest-offline-pin-set", refreshPin);
    };
  }, [bootstrap.user.id]);

  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        setCollapsed(
          window.localStorage.getItem(sidebarStorageKey) === "collapsed",
        ),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [sidebarStorageKey]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const toggleSidebar = () => {
    setCollapsed((value) => {
      window.localStorage.setItem(
        sidebarStorageKey,
        value ? "expanded" : "collapsed",
      );
      return !value;
    });
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden border-r border-[var(--sidebar-border)] transition-[width] duration-200 lg:block",
          collapsed ? "w-[76px]" : "w-[248px]",
        )}
      >
        <SidebarContent collapsed={collapsed} onCollapse={toggleSidebar} />
      </aside>

      <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-[2px]" />
          <Dialog.Content
            id="mobile-navigation"
            className="fixed inset-y-0 left-0 z-50 w-[min(280px,calc(100vw-2rem))] border-r border-[var(--sidebar-border)] bg-[var(--sidebar)] shadow-2xl focus:outline-none"
          >
            <Dialog.Title className="sr-only">Navigation menu</Dialog.Title>
            <Dialog.Description className="sr-only">
              Navigate to {bootstrap.branding.display_name} sections.
            </Dialog.Description>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
            <Dialog.Close className="absolute right-2 top-4 grid size-10 place-items-center rounded-lg text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
              <X className="size-4" />
              <span className="sr-only">Close navigation</span>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
        <div
          className={cn(
            "min-w-0 transition-[padding] duration-200",
            collapsed ? "lg:pl-[76px]" : "lg:pl-[248px]",
          )}
        >
          <AppHeader
            onOpenSearch={() => setSearchOpen(true)}
            mobileNavigationOpen={mobileOpen}
          />
          {bootstrap.support_session && (
            <div
              role="status"
              className="flex items-center gap-2 border-b border-amber-400/40 bg-amber-400/10 px-4 py-2 text-xs text-amber-800 dark:text-amber-200 sm:px-6"
            >
              <ShieldAlert className="size-4 shrink-0" />
              <span>
                Support access is active for{" "}
                <strong>{bootstrap.support_session.actor.full_name}</strong>.
                Every action is audited. Expires{" "}
                {new Date(
                  bootstrap.support_session.expires_at,
                ).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                .
              </span>
            </div>
          )}
          {apiMode && !offline && !bootstrap.support_session && offlinePinReady === false && (
            <div role="status" className="border-b border-amber-400/40 bg-amber-400/10 px-4 py-2 text-xs text-amber-800 dark:text-amber-200 sm:px-6">
              Offline access needs a PIN on this device. <Link href="/settings" className="font-semibold underline">Set it in Settings</Link> while connected.
            </div>
          )}
          <main className="min-w-0">{children}</main>
        </div>
      </Dialog.Root>

      <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
