import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { BusinessStoreProvider } from "@/components/business-store-provider";
import { PlatformProvider } from "@/components/platform-provider";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Area: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

describe("DashboardContent", () => {
  it("renders the business overview without blocking behind a preloader", async () => {
    window.localStorage.clear();
    render(
      <PlatformProvider>
        <BusinessStoreProvider>
          <DashboardContent />
        </BusinessStoreProvider>
      </PlatformProvider>,
    );

    await waitFor(
      () => expect(screen.getByText("Inventory value")).toBeInTheDocument(),
      { timeout: 1500 },
    );

    expect(screen.getByText("Today’s sales")).toBeInTheDocument();
    expect(
      screen.queryByRole("status", { name: "Loading dashboard" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Sales overview")).toBeInTheDocument();
    expect(screen.getByText("Recent sales")).toBeInTheDocument();
    expect(screen.getByText("Stock watch")).toBeInTheDocument();
    expect(screen.getByText("Financial pulse")).toBeInTheDocument();
  });
});
