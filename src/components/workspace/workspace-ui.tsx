"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  ChevronDown,
  Download,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        {eyebrow && (
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--primary-soft-foreground)]">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1.5 text-2xl font-bold tracking-[-0.035em]">
          {title}
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-[var(--muted-foreground)]">
          {description}
        </p>
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}

export function Workspace({
  children,
  size = "wide",
}: {
  children: React.ReactNode;
  size?: "wide" | "medium";
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full space-y-5 p-4 sm:p-6 lg:p-7",
        size === "wide" ? "max-w-[1600px]" : "max-w-[1200px]",
      )}
    >
      {children}
    </div>
  );
}

export function StatTile({
  label,
  value,
  detail,
  icon: Icon,
  tone = "blue",
}: {
  label: string;
  value: string;
  detail?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "blue" | "green" | "amber" | "red";
}) {
  const tones = {
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    red: "bg-red-500/10 text-red-600 dark:text-red-400",
  };
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--card-shadow)]">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-[var(--muted-foreground)]">
            {label}
          </p>
          <p className="mt-2 truncate text-xl font-bold tracking-[-0.03em]">
            {value}
          </p>
          {detail && (
            <p className="mt-1 truncate text-[10px] text-[var(--muted-foreground)]">
              {detail}
            </p>
          )}
        </div>
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg",
            tones[tone],
          )}
        >
          <Icon className="size-4" />
        </span>
      </div>
    </div>
  );
}

export function Toolbar({
  query,
  onQueryChange,
  placeholder = "Search…",
  children,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4 sm:flex-row sm:items-center">
      <label className="relative block w-full max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
        <span className="sr-only">{placeholder}</span>
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={placeholder}
          className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] pl-9 pr-3 text-xs outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-soft)]"
        />
      </label>
      {children && (
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {children}
        </div>
      )}
    </div>
  );
}

export function Select({
  value,
  onChange,
  children,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
  ariaLabel: string;
}) {
  return (
    <label className={cn("relative", className)}>
      <span className="sr-only">{ariaLabel}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 appearance-none rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-3 pr-8 text-xs font-medium outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-soft)]"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--muted-foreground)]" />
    </label>
  );
}

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "green" | "amber" | "red" | "blue" | "neutral";
}) {
  const tones = {
    green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    red: "bg-red-500/10 text-red-700 dark:text-red-400",
    blue: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    neutral: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold capitalize",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const sizes = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--popover)] shadow-2xl outline-none",
            sizes[size],
          )}
        >
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--border)] bg-[var(--popover)] px-5 py-4">
            <div>
              <Dialog.Title className="text-base font-bold">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-1 text-xs text-[var(--muted-foreground)]">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close className="grid size-8 shrink-0 place-items-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]">
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function FormField({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-xs font-semibold">{label}</span>
      {children}
      {hint && (
        <span className="mt-1 block text-[10px] text-[var(--muted-foreground)]">
          {hint}
        </span>
      )}
    </label>
  );
}

export const inputClass =
  "h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-soft)] disabled:opacity-60";

export const textareaClass =
  "min-h-24 w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-soft)]";

export function ModalFooter({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-[var(--border)] px-5 py-4 sm:flex-row sm:justify-end">
      {children}
    </div>
  );
}

export function ExportButton({
  onClick,
  label = "Export CSV",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <Button variant="secondary" onClick={onClick}>
      <Download className="size-4" />
      {label}
    </Button>
  );
}

export function FilterButton({ onClick }: { onClick?: () => void }) {
  return (
    <Button variant="secondary" onClick={onClick}>
      <SlidersHorizontal className="size-4" />
      Filters
    </Button>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-72 place-items-center p-8 text-center">
      <div>
        <span className="mx-auto grid size-11 place-items-center rounded-xl bg-[var(--surface-subtle)] text-[var(--muted-foreground)]">
          <Icon className="size-5" />
        </span>
        <p className="mt-4 text-sm font-semibold">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-[var(--muted-foreground)]">
          {body}
        </p>
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}

export function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--card-shadow)]">
      {children}
    </div>
  );
}

export function downloadCsv(
  filename: string,
  rows: Array<Array<string | number>>,
) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
        .join(","),
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
