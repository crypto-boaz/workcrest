"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import { ChevronLeft, LogOut, Store } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { usePlatform } from "@/components/platform-provider";
import { Button } from "@/components/ui/button";
import { navigation, secondaryNavigation } from "@/lib/navigation";
import { isOfflineRoute } from "@/lib/offline-routes";
import { cn } from "@/lib/utils";

interface SidebarContentProps {
  collapsed?: boolean;
  onCollapse?: () => void;
  onNavigate?: () => void;
}

type NavigationItem =
  | (typeof navigation)[number]
  | (typeof secondaryNavigation)[number];

export function SidebarContent({
  collapsed = false,
  onCollapse,
  onNavigate,
}: SidebarContentProps) {
  const pathname = usePathname();
  const {
    bootstrap,
    offline,
    currentLocation,
    moduleEnabled,
    setCurrentLocation,
    signOut,
  } = usePlatform();
  const primaryNavigation: readonly NavigationItem[] = moduleEnabled("commerce")
    ? offline ? navigation.filter((item) => isOfflineRoute(item.href)) : navigation
    : [];

  const navItems = (items: readonly NavigationItem[]) =>
    items.map((item) => {
      const Icon = item.icon;
      const active = pathname === item.href;
      const link = offline ? (
        <a key={item.href} href={item.href} onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={cn(
            "group flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--sidebar-ring)]",
            active ? "bg-[var(--sidebar-active)] text-[var(--primary-foreground)]" : "text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-foreground)]",
            collapsed && "justify-center px-0",
          )}>
          <Icon className="size-[18px] shrink-0" strokeWidth={1.8} />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </a>
      ) : (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={cn(
            "group flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--sidebar-ring)]",
            active
              ? "bg-[var(--sidebar-active)] text-[var(--primary-foreground)]"
              : "text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-foreground)]",
            collapsed && "justify-center px-0",
          )}
        >
          <Icon className="size-[18px] shrink-0" strokeWidth={1.8} />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </Link>
      );

      if (!collapsed) return link;

      return (
        <Tooltip.Root key={item.href}>
          <Tooltip.Trigger asChild>{link}</Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              side="right"
              sideOffset={10}
              className="z-50 rounded-md bg-[var(--popover)] px-2.5 py-1.5 text-xs font-medium text-[var(--foreground)] shadow-lg"
            >
              {item.label}
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      );
    });

  return (
    <Tooltip.Provider delayDuration={250}>
      <div className="flex h-full min-h-0 flex-col bg-[var(--sidebar)]">
        <div
          className={cn(
            "flex h-[72px] shrink-0 items-center border-b border-[var(--sidebar-border)] px-5",
            collapsed && "justify-center px-2",
          )}
        >
          <BrandMark compact={collapsed} />
        </div>

        <nav
          aria-label="Primary navigation"
          className="scrollbar-thin flex-1 space-y-1 overflow-y-auto px-3 py-5"
        >
          {navItems(primaryNavigation)}
          <div className="my-4 border-t border-[var(--sidebar-border)]" />
          {navItems(secondaryNavigation)}
        </nav>

        <div className="shrink-0 border-t border-[var(--sidebar-border)] p-3">
          <div
            className={cn(
              "mb-2 flex items-center gap-3 rounded-lg bg-[var(--sidebar-hover)] p-3",
              collapsed && "justify-center p-2",
            )}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[var(--sidebar-card)] text-[var(--primary-soft-foreground)]">
              <Store className="size-4" />
            </span>
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-[var(--sidebar-foreground)]">
                  {bootstrap.branding.display_name}
                </p>
                <p className="truncate text-[10px] text-[var(--sidebar-muted)]">
                  {currentLocation.name} · {currentLocation.code}
                </p>
              </div>
            )}
          </div>
          {!collapsed && bootstrap.locations.length > 1 && (
            <label className="mb-2 block">
              <span className="sr-only">Active location</span>
              <select
                value={currentLocation.id}
                onChange={(event) => setCurrentLocation(event.target.value)}
                className="h-10 w-full rounded-lg border border-[var(--sidebar-border)] bg-[var(--sidebar-hover)] px-3 text-xs text-[var(--sidebar-foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-ring)]"
              >
                {bootstrap.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!offline && <Button
            variant="ghost"
            className={cn(
              "w-full justify-start text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-white",
              collapsed && "justify-center px-0",
            )}
            onClick={() => void signOut()}
          >
            <LogOut className="size-4" />
            {!collapsed && "Sign out"}
          </Button>}
        </div>

        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="absolute -right-3 top-24 z-10 hidden size-6 place-items-center rounded-full border border-[var(--sidebar-border)] bg-[var(--sidebar)] text-[var(--sidebar-muted)] shadow-sm transition hover:text-white lg:grid"
          >
            <ChevronLeft
              className={cn(
                "size-3.5 transition-transform",
                collapsed && "rotate-180",
              )}
            />
          </button>
        )}
      </div>
    </Tooltip.Provider>
  );
}
