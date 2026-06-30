"use client";

import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardData, SalesPoint } from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";

export type SalesPeriod = "sevenDays" | "thirtyDays" | "thisMonth";

const periodOptions: { label: string; value: SalesPeriod }[] = [
  { label: "7 days", value: "sevenDays" },
  { label: "30 days", value: "thirtyDays" },
  { label: "This month", value: "thisMonth" },
];

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: SalesPoint }>;
}) {
  if (!active || !payload?.[0]) return null;
  const point = payload[0].payload;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--popover)] px-3 py-2 shadow-xl">
      <p className="text-[10px] font-medium text-[var(--muted-foreground)]">
        {point.label}
      </p>
      <p className="mt-0.5 text-sm font-bold">{formatCurrency(point.sales)}</p>
      <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
        {point.transactions} transactions
      </p>
    </div>
  );
}

export function SalesChart({
  sales,
  period,
  onPeriodChange,
}: {
  sales: DashboardData["sales"];
  period: SalesPeriod;
  onPeriodChange: (period: SalesPeriod) => void;
}) {
  const gradientId = useId().replaceAll(":", "");
  const data = sales[period];
  const total = data.reduce((sum, item) => sum + item.sales, 0);
  const transactions = data.reduce(
    (sum, item) => sum + item.transactions,
    0,
  );

  return (
    <Card aria-labelledby="sales-overview-title">
      <CardHeader className="flex-col gap-4 sm:flex-row sm:items-center">
        <div>
          <CardTitle id="sales-overview-title">Sales overview</CardTitle>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-2xl font-bold tracking-[-0.03em]">
              {formatCurrency(total)}
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">
              {transactions} transactions
            </p>
          </div>
        </div>
        <div
          className="flex w-full rounded-lg bg-[var(--surface-subtle)] p-1 sm:w-auto"
          aria-label="Sales chart period"
        >
          {periodOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onPeriodChange(option.value)}
              aria-pressed={period === option.value}
              className={cn(
                "h-7 flex-1 whitespace-nowrap rounded-md px-2.5 text-[11px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:flex-none",
                period === option.value
                  ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="pt-1">
        <div
          role="img"
          aria-label={`Sales chart showing ${formatCurrency(total)} across ${data.length} days.`}
          className="h-[272px] w-full"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 8, right: 4, left: -16, bottom: 0 }}
            >
              <defs>
                <linearGradient
                  id={gradientId}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor="var(--chart)"
                    stopOpacity={0.22}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--chart)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="var(--chart-grid)"
                strokeDasharray="3 4"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                minTickGap={28}
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                dy={8}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={54}
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                tickFormatter={(value) => formatCurrency(value, true)}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
              />
              <Area
                type="monotone"
                dataKey="sales"
                stroke="var(--chart)"
                strokeWidth={2.25}
                fill={`url(#${gradientId})`}
                activeDot={{
                  r: 4,
                  fill: "var(--chart)",
                  stroke: "var(--surface)",
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
