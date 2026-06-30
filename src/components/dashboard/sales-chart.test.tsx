import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SalesChart } from "@/components/dashboard/sales-chart";
import { mockDashboardData } from "@/lib/mock-data";

vi.mock("recharts", async () => {
  const original = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...original,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
  };
});

describe("SalesChart", () => {
  it("announces the selected period and emits period changes", () => {
    const onPeriodChange = vi.fn();
    render(
      <SalesChart
        sales={mockDashboardData.sales}
        period="sevenDays"
        onPeriodChange={onPeriodChange}
      />,
    );

    expect(
      screen.getByRole("button", { name: "7 days" }),
    ).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "30 days" }));
    expect(onPeriodChange).toHaveBeenCalledWith("thirtyDays");
  });
});
