import { AppShell } from "@/components/app-shell";
import { BusinessStoreProvider } from "@/components/business-store-provider";
import { PlatformProvider } from "@/components/platform-provider";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PlatformProvider>
      <BusinessStoreProvider>
        <AppShell>{children}</AppShell>
      </BusinessStoreProvider>
    </PlatformProvider>
  );
}
