import { AppShell } from "@/components/app-shell";
import { BusinessStoreProvider } from "@/components/business-store-provider";
import { PlatformProvider } from "@/components/platform-provider";
import { OfflineWorkspaceProvider } from "@/components/offline-workspace-provider";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PlatformProvider>
      <OfflineWorkspaceProvider>
        <BusinessStoreProvider>
          <AppShell>{children}</AppShell>
        </BusinessStoreProvider>
      </OfflineWorkspaceProvider>
    </PlatformProvider>
  );
}
