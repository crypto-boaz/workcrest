import Image from "next/image";

import { cn } from "@/lib/utils";

export function WorkcrestLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/workcrest-rising-crest-192.png"
      alt="Workcrest Rising Crest logo"
      width={192}
      height={192}
      className={cn("rounded-lg object-cover", className)}
      priority
    />
  );
}
