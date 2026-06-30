"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  UserRound,
} from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";

import { usePlatform } from "@/components/platform-provider";
import { useNotifications } from "@/components/use-notifications";
import { Button } from "@/components/ui/button";
import { formatDate, formatTime } from "@/lib/utils";

const menuContent =
  "z-50 min-w-56 rounded-xl border border-[var(--border)] bg-[var(--popover)] p-1.5 text-[var(--foreground)] shadow-xl";
const menuItem =
  "flex cursor-default select-none items-center gap-2.5 rounded-lg px-3 py-2 text-sm outline-none transition-colors focus:bg-[var(--surface-hover)]";

export function AppHeader({
  onOpenMobile,
  onOpenSearch,
}: {
  onOpenMobile: () => void;
  onOpenSearch: () => void;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const { notifications, unread, markRead } = useNotifications();
  const {
    bootstrap,
    currentLocation,
    setCurrentLocation,
    signOut,
  } = usePlatform();
  const userName = bootstrap.user.full_name || bootstrap.user.email;
  const initials = userName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const roleLabel =
    bootstrap.membership?.title ||
    bootstrap.membership?.roles[0]?.role ||
    "Team member";

  return (
    <header className="sticky top-0 z-30 flex h-[72px] items-center gap-3 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_94%,transparent)] px-4 backdrop-blur-md sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        onClick={onOpenMobile}
        className="lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="size-5" />
      </Button>

      <button
        type="button"
        onClick={onOpenSearch}
        className="hidden h-10 w-full max-w-sm items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--muted-foreground)] outline-none transition hover:border-[var(--border-strong)] hover:text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:flex"
      >
        <Search className="size-4" />
        <span>Search anything</span>
        <kbd className="ml-auto rounded border border-[var(--border)] bg-[var(--surface-subtle)] px-1.5 py-0.5 font-sans text-[10px]">
          Ctrl K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <div className="hidden items-center gap-2 rounded-lg px-2.5 text-xs text-[var(--muted-foreground)] xl:flex">
          <CalendarDays className="size-4" />
          <span suppressHydrationWarning>{formatDate(new Date())}</span>
        </div>

        {bootstrap.locations.length > 1 && (
          <label className="hidden md:block">
            <span className="sr-only">Active location</span>
            <select
              value={currentLocation.id}
              onChange={(event) => setCurrentLocation(event.target.value)}
              className="h-9 max-w-36 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              {bootstrap.locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={() =>
            setTheme(resolvedTheme === "dark" ? "light" : "dark")
          }
          aria-label="Toggle theme"
        >
          <Sun className="hidden size-[18px] dark:block" />
          <Moon className="size-[18px] dark:hidden" />
        </Button>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              aria-label={`${unread} unread notifications`}
            >
              <Bell className="size-[18px]" />
              {unread > 0 && (
                <span className="absolute right-2 top-2 size-2 rounded-full bg-amber-500 ring-2 ring-[var(--background)]" />
              )}
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              className={`${menuContent} w-[min(22rem,calc(100vw-2rem))]`}
            >
              <div className="flex items-center justify-between px-3 py-2">
                <p className="text-sm font-semibold">Notifications</p>
                <span className="text-xs text-[var(--primary-soft-foreground)]">
                  {unread} new
                </span>
              </div>
              <DropdownMenu.Separator className="my-1 h-px bg-[var(--border)]" />
              {notifications.slice(0, 4).map((item) => (
                <DropdownMenu.Item
                  key={item.id}
                  onSelect={() => markRead(item.id)}
                  className={`${menuItem} items-start py-2.5`}
                >
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${
                      item.tone === "warning"
                        ? "bg-amber-500"
                        : item.tone === "success"
                          ? "bg-emerald-500"
                          : "bg-blue-500"
                    }`}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--muted-foreground)]">
                      {item.body}
                    </span>
                    <span className="mt-1 block text-[10px] text-[var(--muted-foreground)]">
                      {formatTime(item.createdAt)}
                    </span>
                  </span>
                </DropdownMenu.Item>
              ))}
              <DropdownMenu.Separator className="my-1 h-px bg-[var(--border)]" />
              <DropdownMenu.Item asChild>
                <Link
                  href="/alerts"
                  className={`${menuItem} justify-center font-semibold text-[var(--primary-soft-foreground)]`}
                >
                  View alert center
                </Link>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className="flex h-10 items-center gap-2 rounded-lg px-1.5 outline-none hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:px-2"
            >
              <span className="grid size-8 place-items-center rounded-lg bg-[var(--primary-soft)] text-xs font-bold text-[var(--primary-soft-foreground)]">
                {initials}
              </span>
              <span className="hidden text-left xl:block">
                <span className="block max-w-28 truncate text-xs font-semibold">
                  {userName}
                </span>
                <span className="block text-[10px] text-[var(--muted-foreground)]">
                  {roleLabel}
                </span>
              </span>
              <ChevronDown className="hidden size-3.5 text-[var(--muted-foreground)] xl:block" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              className={menuContent}
            >
              <DropdownMenu.Label className="px-3 py-2">
                <span className="block text-xs font-semibold">{userName}</span>
                <span className="block text-[10px] font-normal text-[var(--muted-foreground)]">
                  {bootstrap.user.email}
                </span>
              </DropdownMenu.Label>
              <DropdownMenu.Separator className="my-1 h-px bg-[var(--border)]" />
              <DropdownMenu.Item className={menuItem}>
                <UserRound className="size-4" /> Profile
              </DropdownMenu.Item>
              <DropdownMenu.Item className={menuItem}>
                <Settings className="size-4" /> Account settings
              </DropdownMenu.Item>
              <DropdownMenu.Item className={menuItem}>
                <CircleHelp className="size-4" /> Help center
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-[var(--border)]" />
              <DropdownMenu.Item
                className={`${menuItem} text-red-500`}
                onSelect={() => void signOut()}
              >
                <LogOut className="size-4" /> Sign out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <Button asChild className="hidden sm:inline-flex">
          <Link href="/pos">
            <Plus className="size-4" />
            New sale
          </Link>
        </Button>
      </div>
    </header>
  );
}
