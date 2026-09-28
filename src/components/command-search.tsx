"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { usePlatform } from "@/components/platform-provider";
import { navigation, secondaryNavigation } from "@/lib/navigation";
import { isOfflineRoute } from "@/lib/offline-routes";

const searchItems = [...navigation, ...secondaryNavigation];

export function CommandSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const router = useRouter();
  const { manifest, offline } = usePlatform();
  const results = useMemo(
    () =>
      searchItems.filter((item) =>
        (!offline || isOfflineRoute(item.href)) &&
        item.label.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [offline, query],
  );

  const handleOpenChange = (value: boolean) => {
    if (!value) setQuery("");
    onOpenChange(value);
  };

  const go = (href: string) => {
    if (offline) window.location.assign(href);
    else router.push(href);
    handleOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] data-[state=open]:animate-in" />
        <Dialog.Content className="fixed left-1/2 top-[15vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--popover)] shadow-2xl focus:outline-none">
          <Dialog.Title className="sr-only">
            Search {manifest.branding.display_name}
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            Search and navigate to a section of the store dashboard.
          </Dialog.Description>
          <div className="flex items-center border-b border-[var(--border)] px-4">
            <Search className="size-4 shrink-0 text-[var(--muted-foreground)]" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && results[0]) go(results[0].href);
              }}
              placeholder="Search pages and tools…"
              className="h-14 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-[var(--muted-foreground)]"
            />
            <Dialog.Close className="grid size-8 place-items-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]">
              <X className="size-4" />
              <span className="sr-only">Close search</span>
            </Dialog.Close>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            <p className="px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
              Navigate
            </p>
            {results.length ? (
              results.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    type="button"
                    key={item.href}
                    onClick={() => go(item.href)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    <Icon className="size-4 text-[var(--muted-foreground)]" />
                    <span className="font-medium">{item.label}</span>
                    <span className="ml-auto text-xs text-[var(--muted-foreground)]">
                      {item.href}
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-10 text-center text-sm text-[var(--muted-foreground)]">
                No matching page found.
              </p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
