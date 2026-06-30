"use client";

import { CustomersPage, SalesPage } from "@/components/workspace/sales-customers-pages";
import { ProductsPage } from "@/components/workspace/products-page";
import { PosPage } from "@/components/workspace/pos-page";
import {
  PurchasesPage,
  ReturnsPage,
} from "@/components/workspace/purchases-returns-pages";
import {
  AlertsPage,
  ReportsPage,
  SettingsPage,
} from "@/components/workspace/reports-alerts-settings-pages";
import {
  ExpensesPage,
  StaffPage,
} from "@/components/workspace/staff-expenses-pages";

export function SectionPage({ section }: { section: string }) {
  switch (section) {
    case "products":
      return <ProductsPage />;
    case "sales":
      return <SalesPage />;
    case "pos":
      return <PosPage />;
    case "customers":
      return <CustomersPage />;
    case "purchases":
      return <PurchasesPage />;
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
