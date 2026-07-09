"use client";

import {
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Boxes,
  CircleAlert,
  CreditCard,
  Headphones,
  PackageSearch,
  ReceiptText,
  ShoppingBag,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useBusinessStore } from "@/components/business-store-provider";
import { usePlatform } from "@/components/platform-provider";
import {
  SalesChart,
  type SalesPeriod,
} from "@/components/dashboard/sales-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  DashboardData,
  DashboardMetric,
  TransactionStatus,
} from "@/lib/types";
import { cn, formatCurrency, formatDate, formatTime } from "@/lib/utils";

const metricIcons = {
  inventoryValue: Boxes,
  todaysSales: ShoppingBag,
  monthlySales: TrendingUp,
  totalProducts: PackageSearch,
};

function MetricCard({ metric }: { metric: DashboardMetric }) {
  const Icon = metricIcons[metric.key];
  return (
    <Card className="group relative overflow-hidden p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-[var(--muted-foreground)]">
            {metric.label}
          </p>
          <p className="mt-2 text-[clamp(1.35rem,2vw,1.7rem)] font-bold tracking-[-0.035em]">
            {metric.format === "currency"
              ? formatCurrency(metric.value)
              : new Intl.NumberFormat().format(metric.value)}
          </p>
        </div>
        <span className="grid size-9 place-items-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary-soft-foreground)]">
          <Icon className="size-[18px]" strokeWidth={1.8} />
        </span>
      </div>
      <div className="mt-5 flex items-center gap-1.5 text-[11px]">
        <span className="inline-flex items-center gap-0.5 font-semibold text-emerald-600 dark:text-emerald-400">
          <ArrowUpRight className="size-3" />
          {metric.change}%
        </span>
        <span className="truncate text-[var(--muted-foreground)]">
          {metric.changeLabel}
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-[var(--primary)] transition-transform duration-200 group-hover:scale-x-100" />
    </Card>
  );
}

function StatusPill({ status }: { status: TransactionStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-1 text-[10px] font-semibold capitalize",
        status === "completed" &&
          "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        status === "pending" &&
          "bg-amber-500/12 text-amber-700 dark:text-amber-400",
        status === "refunded" &&
          "bg-red-500/10 text-red-700 dark:text-red-400",
      )}
    >
      {status}
    </span>
  );
}

function RecentTransactions({
  transactions,
}: {
  transactions: DashboardData["transactions"];
}) {
  return (
    <Card aria-labelledby="recent-sales-title">
      <CardHeader className="items-center">
        <div>
          <CardTitle id="recent-sales-title">Recent sales</CardTitle>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Latest transactions across all payment methods
          </p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/sales">
            View all <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </CardHeader>
      {transactions.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-xs">
            <thead>
              <tr className="border-y border-[var(--border)] bg-[var(--surface-subtle)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
                <th className="px-5 py-2.5 font-semibold">Transaction</th>
                <th className="px-4 py-2.5 font-semibold">Customer</th>
                <th className="px-4 py-2.5 font-semibold">Payment</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-5 py-2.5 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => (
                <tr
                  key={transaction.id}
                  className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-subtle)]"
                >
                  <td className="px-5 py-3.5">
                    <p className="font-semibold">{transaction.id}</p>
                    <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
                      {formatTime(transaction.createdAt)}
                    </p>
                  </td>
                  <td className="px-4 py-3.5 font-medium">
                    {transaction.customer}
                  </td>
                  <td className="px-4 py-3.5 text-[var(--muted-foreground)]">
                    {transaction.method}
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusPill status={transaction.status} />
                  </td>
                  <td className="px-5 py-3.5 text-right font-bold">
                    {formatCurrency(transaction.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid min-h-64 place-items-center px-6 text-center">
          <div>
            <ReceiptText className="mx-auto size-8 text-[var(--muted-foreground)]" />
            <p className="mt-3 text-sm font-semibold">No sales yet</p>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              New transactions will appear here.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

function StockWatch({ alerts }: { alerts: DashboardData["stockAlerts"] }) {
  const outCount = alerts.filter((item) => item.severity === "out").length;
  const lowCount = alerts.length - outCount;

  return (
    <Card aria-labelledby="stock-watch-title">
      <CardHeader>
        <div>
          <CardTitle id="stock-watch-title">Stock watch</CardTitle>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            {outCount} out · {lowCount} running low
          </p>
        </div>
        <span className="grid size-8 place-items-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <CircleAlert className="size-4" />
        </span>
      </CardHeader>
      <CardContent className="space-y-1 px-3">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-[var(--surface-subtle)]"
          >
            <span
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-lg",
                alert.severity === "out"
                  ? "bg-red-500/10 text-red-600 dark:text-red-400"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
              )}
            >
              <PackageSearch className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{alert.product}</p>
              <p className="mt-0.5 truncate text-[10px] text-[var(--muted-foreground)]">
                {alert.sku} · Reorder at {alert.reorderAt}
              </p>
            </div>
            <span
              className={cn(
                "text-[10px] font-bold",
                alert.severity === "out"
                  ? "text-red-600 dark:text-red-400"
                  : "text-amber-700 dark:text-amber-400",
              )}
            >
              {alert.remaining === 0 ? "Out" : `${alert.remaining} left`}
            </span>
          </div>
        ))}
        <Button asChild variant="secondary" size="sm" className="mt-3 w-full">
          <Link href="/products">Review inventory</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function FinanceSummary({
  finances,
}: {
  finances: DashboardData["finances"];
}) {
  const items = [
    {
      label: "Customer debts",
      value: finances.customerDebts,
      icon: CreditCard,
      tone: "text-amber-600 dark:text-amber-400",
    },
    {
      label: "Supplier payments",
      value: finances.supplierPayments,
      icon: Banknote,
      tone: "text-blue-600 dark:text-blue-400",
    },
    {
      label: "Monthly expenses",
      value: finances.monthlyExpenses,
      icon: WalletCards,
      tone: "text-slate-600 dark:text-slate-300",
    },
  ];

  return (
    <Card aria-labelledby="finance-title">
      <CardHeader>
        <div>
          <CardTitle id="finance-title">Financial pulse</CardTitle>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Cash flow and obligations
          </p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/expenses">Details</Link>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg bg-[var(--primary-soft)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--primary-soft-foreground)]">
            Net cash flow
          </p>
          <p className="mt-1.5 text-2xl font-bold tracking-[-0.03em]">
            {formatCurrency(finances.netCashFlow)}
          </p>
          <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
            Month to date
          </p>
        </div>
        <div className="mt-3 divide-y divide-[var(--border)]">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="flex items-center gap-3 py-3 first:pt-1 last:pb-0"
              >
                <Icon className={cn("size-4", item.tone)} />
                <p className="text-xs text-[var(--muted-foreground)]">
                  {item.label}
                </p>
                <p className="ml-auto text-xs font-bold">
                  {formatCurrency(item.value)}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardContent() {
  const { state, hydrated } = useBusinessStore();
  const { bootstrap } = usePlatform();
  const locale = bootstrap.organization.locale;
  const firstName =
    bootstrap.user.full_name.trim().split(/\s+/)[0] || "there";
  const [period, setPeriod] = useState<SalesPeriod>("sevenDays");
  const data = useMemo<DashboardData>(() => {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const monthSales = state.sales.filter((sale) => {
      const date = new Date(sale.createdAt);
      return (
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear()
      );
    });
    const todaySales = state.sales.filter(
      (sale) => new Date(sale.createdAt).getTime() >= startOfToday.getTime(),
    );
    const inventoryValue = state.products.reduce(
      (sum, product) => sum + product.cost * product.stock,
      0,
    );
    const monthlyRevenue = monthSales.reduce(
      (sum, sale) => sum + sale.total,
      0,
    );
    const monthlyExpenses = state.expenses
      .filter((expense) => {
        const date = new Date(expense.date);
        return (
          date.getMonth() === now.getMonth() &&
          date.getFullYear() === now.getFullYear()
        );
      })
      .reduce((sum, expense) => sum + expense.amount, 0);

    const buildSeries = (days: number) =>
      Array.from({ length: days }, (_, index) => {
        const date = new Date(now);
        date.setDate(date.getDate() - (days - index - 1));
        const matching = state.sales.filter(
          (sale) =>
            new Date(sale.createdAt).toDateString() === date.toDateString(),
        );
        return {
          date: date.toISOString(),
          label: new Intl.DateTimeFormat(locale, {
            day: days > 7 ? "numeric" : undefined,
            month: days > 7 ? "short" : undefined,
            weekday: days <= 7 ? "short" : undefined,
          }).format(date),
          sales: matching.reduce((sum, sale) => sum + sale.total, 0),
          transactions: matching.length,
        };
      });

    return {
      businessName: bootstrap.branding.display_name,
      metrics: [
        {
          key: "inventoryValue",
          label: "Inventory value",
          value: inventoryValue,
          format: "currency",
          change: 4.2,
          changeLabel: "live stock at cost",
        },
        {
          key: "todaysSales",
          label: "Today’s sales",
          value: todaySales.reduce((sum, sale) => sum + sale.total, 0),
          format: "currency",
          change: 12.8,
          changeLabel: `${todaySales.length} transactions today`,
        },
        {
          key: "monthlySales",
          label: "Monthly sales",
          value: monthlyRevenue,
          format: "currency",
          change: 7.4,
          changeLabel: "current calendar month",
        },
        {
          key: "totalProducts",
          label: "Total products",
          value: state.products.filter((product) => product.status === "active")
            .length,
          format: "number",
          change: 2.1,
          changeLabel: `${state.products.reduce((sum, product) => sum + product.stock, 0)} units on hand`,
        },
      ],
      sales: {
        sevenDays: buildSeries(7),
        thirtyDays: buildSeries(30),
        thisMonth: buildSeries(Math.max(now.getDate(), 7)),
      },
      transactions: state.sales.slice(0, 5).map((sale) => ({
        id: sale.id,
        customer: sale.customerName,
        createdAt: sale.createdAt,
        amount: sale.total,
        method: sale.paymentMethod,
        status: sale.status === "refunded" ? "refunded" : "completed",
      })),
      stockAlerts: state.products
        .filter((product) => product.stock <= product.reorderLevel)
        .sort((a, b) => a.stock - b.stock)
        .slice(0, 4)
        .map((product) => ({
          id: product.id,
          product: product.name,
          sku: product.sku,
          remaining: product.stock,
          reorderAt: product.reorderLevel,
          severity: product.stock === 0 ? "out" : "low",
        })),
      finances: {
        customerDebts: state.customers.reduce(
          (sum, customer) => sum + customer.outstanding,
          0,
        ),
        supplierPayments: state.suppliers.reduce(
          (sum, supplier) => sum + supplier.balance,
          0,
        ),
        monthlyExpenses,
        netCashFlow: monthlyRevenue - monthlyExpenses,
      },
      notifications: state.notifications.map((notification) => ({
        id: notification.id,
        title: notification.title,
        body: notification.body,
        createdAt: notification.createdAt,
        unread: notification.unread,
        tone: notification.tone,
      })),
      lastUpdated: state.sales[0]?.createdAt ?? new Date().toISOString(),
    };
  }, [bootstrap.branding.display_name, locale, state]);

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const unread = data.notifications.filter((item) => item.unread).length;

  return (
    <div className="space-y-5">
      <section className="flex flex-col justify-between gap-5 rounded-xl border border-[var(--border)] bg-[var(--hero)] p-5 shadow-[var(--card-shadow)] sm:flex-row sm:items-end sm:p-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--primary-soft-foreground)]">
            Daily overview
          </p>
          <h1
            suppressHydrationWarning
            className="mt-2 text-2xl font-bold tracking-[-0.035em] sm:text-[1.75rem]"
          >
            {greeting}, {firstName}.
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-[var(--muted-foreground)]">
            Here’s what is happening at {data.businessName} today.
          </p>
        </div>
        <div className="text-left sm:text-right">
          {!hydrated && (
            <p
              role="status"
              aria-label="Syncing dashboard data"
              className="mb-2 inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[10px] font-semibold text-[var(--muted-foreground)]"
            >
              Syncing data…
            </p>
          )}
          <p
            suppressHydrationWarning
            className="text-xs font-semibold text-[var(--foreground)]"
          >
            {formatDate(new Date(), { weekday: "long" })}
          </p>
          <p
            suppressHydrationWarning
            className="mt-1 text-[10px] text-[var(--muted-foreground)]"
          >
            Updated {formatTime(data.lastUpdated)}
          </p>
        </div>
      </section>

      <section
        aria-label="Business summary"
        className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4"
      >
        {data.metrics.map((metric) => (
          <MetricCard key={metric.key} metric={metric} />
        ))}
      </section>

      <section className="grid items-start gap-4 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <SalesChart
            sales={data.sales}
            period={period}
            onPeriodChange={setPeriod}
          />
        </div>
        <StockWatch alerts={data.stockAlerts} />
      </section>

      <section className="grid items-start gap-4 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <RecentTransactions transactions={data.transactions} />
        </div>
        <FinanceSummary finances={data.finances} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary-soft-foreground)]">
            <CircleAlert className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Notification center</p>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              {unread} unread updates ·{" "}
              {data.notifications[0]?.title ?? "Everything looks good"}
            </p>
          </div>
          <Button
            asChild
            variant="secondary"
            size="sm"
            className="sm:ml-auto"
          >
            <Link href="/alerts">Open alerts</Link>
          </Button>
        </Card>
        <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Headphones className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Need a hand?</p>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Get support with sales or stock issues.
            </p>
          </div>
          <Button variant="ghost" size="sm" className="sm:ml-auto">
            Get help <ArrowRight className="size-3.5" />
          </Button>
        </Card>
      </section>
    </div>
  );
}
