import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

let runtimeLocale = "en-US";
let runtimeCurrency = "USD";

export function configureFormatting({
  locale,
  currency,
}: {
  locale: string;
  currency: string;
}) {
  runtimeLocale = locale;
  runtimeCurrency = currency;
}

export const formatCurrency = (value: number, compact = false) =>
  new Intl.NumberFormat(runtimeLocale, {
    style: "currency",
    currency: runtimeCurrency,
    maximumFractionDigits: 0,
    notation: compact ? "compact" : "standard",
  }).format(value);

export const formatDate = (date: Date, options?: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(runtimeLocale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...options,
  }).format(date);

export const formatTime = (isoDate: string) =>
  new Intl.DateTimeFormat(runtimeLocale, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(isoDate));
