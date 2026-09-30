"use client";

import { LockKeyhole } from "lucide-react";

import { useBusinessStore } from "@/components/business-store-provider";
import { SalesPage } from "@/components/workspace/sales-customers-pages";
import { ProductsPage } from "@/components/workspace/products-page";
import { PosPage } from "@/components/workspace/pos-page";
import { JobCardsPage } from "@/components/workspace/job-cards-page";
import { ReturnsPage } from "@/components/workspace/purchases-returns-pages";
import { Card, CardContent } from "@/components/ui/card";
import {
  PageHeader,
  Workspace,
} from "@/components/workspace/workspace-ui";
import {
  AlertsPage,
  ReportsPage,
  SettingsPage,
} from "@/components/workspace/reports-alerts-settings-pages";
import {
  ExpensesPage,
  StaffPage,
} from "@/components/workspace/staff-expenses-pages";
import { apiMode } from "@/lib/platform-api";

function AdminOnlyPage({ title }: { title: string }) {
  return (
    <Workspace size="medium">
      <PageHeader
        eyebrow="Restricted"
        title={title}
        description="This area is reserved for the Workcrest platform owner."
      />
      <Card>
        <CardContent className="grid min-h-80 place-items-center p-8 text-center">
          <div>
            <span className="mx-auto grid size-12 place-items-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400">
              <LockKeyhole className="size-5" />
            </span>
            <h2 className="mt-4 text-base font-semibold">Only admin access</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--muted-foreground)]">
              This capability is currently unavailable across tenant
              workspaces.
            </p>
          </div>
        </CardContent>
      </Card>
    </Workspace>
  );
}

export function SectionPage({ section }: { section: string }) {
  const { hydrated } = useBusinessStore();
  if (apiMode && !hydrated && !["products", "sales", "job-cards"].includes(section)) {
    return (
      <Workspace>
        <p role="status" className="p-5 text-sm text-[var(--muted-foreground)]">
          Loading workspace data…
        </p>
      </Workspace>
    );
  }
  switch (section) {
    case "products":
      return <ProductsPage />;
    case "sales":
      return <SalesPage />;
    case "pos":
      return <PosPage />;
    case "job-cards":
      return <JobCardsPage />;
    case "customers":
      return <AdminOnlyPage title="Customers" />;
    case "purchases":
      return <AdminOnlyPage title="Purchases" />;
    case "returns":
      return <ReturnsPage />;
    case "people":
      return <StaffPage />;
    case "expenses":
      return <ExpensesPage />;
    case "reports":
      return <ReportsPage />;
    case "alerts":
      return <AlertsPage />;
    case "settings":
      return <SettingsPage />;
    default:
      return null;
  }
}
