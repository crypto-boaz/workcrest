"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import { cn } from "@/lib/utils";

interface TenantLogoProps {
  src?: string;
  alt: string;
  fallback: ReactNode;
  className?: string;
  imageClassName?: string;
}

export function TenantLogo({
  src,
  alt,
  fallback,
  className,
  imageClassName,
}: TenantLogoProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const shouldShowImage = Boolean(src && src !== failedSrc);

  return (
    <span className={cn("grid overflow-hidden", className)}>
      {shouldShowImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className={cn("h-full w-full object-contain", imageClassName)}
          loading="eager"
          decoding="async"
          onError={() => setFailedSrc(src ?? null)}
        />
      ) : (
        fallback
      )}
    </span>
  );
}
