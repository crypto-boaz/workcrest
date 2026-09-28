"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { usePlatform } from "@/components/platform-provider";

export function WorkspaceLink({
  href,
  children,
  className,
  "aria-label": ariaLabel,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  const { offline } = usePlatform();
  if (offline) {
    return <a href={href} className={className} aria-label={ariaLabel}>{children}</a>;
  }
  return <Link href={href} className={className} aria-label={ariaLabel}>{children}</Link>;
}
