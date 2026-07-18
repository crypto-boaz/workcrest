import { BarChart3, ShoppingBag } from "lucide-react";

import { usePlatform } from "@/components/platform-provider";
import { TenantLogo } from "@/components/tenant-logo";
import { cn } from "@/lib/utils";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  const { manifest } = usePlatform();
  return (
    <div className="flex min-w-0 items-center gap-3">
      <TenantLogo
        src={manifest.branding.logo_url}
        alt={`${manifest.branding.display_name} logo`}
        className="relative size-9 shrink-0 place-items-center rounded-lg bg-[var(--primary)] p-1 text-[var(--primary-foreground)] shadow-sm"
        fallback={
          <>
            <ShoppingBag className="size-4" strokeWidth={2.2} />
            <BarChart3 className="absolute -bottom-1 -right-1 size-4 rounded bg-[var(--sidebar)] p-0.5 text-[var(--primary-soft-foreground)]" />
          </>
        }
      />
      <div
        className={cn(
          "min-w-0 transition-[opacity,width] duration-200",
          compact && "w-0 overflow-hidden opacity-0",
        )}
      >
        <p className="truncate text-sm font-bold tracking-tight text-[var(--sidebar-foreground)]">
          {manifest.branding.display_name}
        </p>
        <p className="truncate text-[10px] font-medium uppercase tracking-[0.13em] text-[var(--sidebar-muted)]">
          Business operations
        </p>
      </div>
    </div>
  );
}
