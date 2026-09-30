"use client";

import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  BellOff,
  Building2,
  Check,
  CheckCheck,
  CircleDollarSign,
  Info,
  ImagePlus,
  PackageCheck,
  Save,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useBusinessStore } from "@/components/business-store-provider";
import { usePlatform } from "@/components/platform-provider";
import { PwaInstallCard } from "@/components/pwa-install-card";
import { TenantLogo } from "@/components/tenant-logo";
import { useNotifications } from "@/components/use-notifications";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { platformApi, PlatformApiError } from "@/lib/platform-api";
import type { CompanySettingsInput } from "@/lib/platform-types";
import { cn, formatCurrency, formatDate, formatTime } from "@/lib/utils";
import {
  downloadCsv,
  ExportButton,
  FormField,
  inputClass,
  Modal,
  ModalFooter,
  PageHeader,
  Select,
  StatTile,
  Workspace,
} from "@/components/workspace/workspace-ui";

export function ReportsPage() {
  const { state } = useBusinessStore();
  const { bootstrap, offline } = usePlatform();
  const [period, setPeriod] = useState("30");
  const [transactionQuery, setTransactionQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [referenceTime] = useState(() => Date.now());

  const cutoff =
    period === "all"
      ? 0
      : referenceTime - Number(period) * 24 * 60 * 60 * 1000;
  const sales = state.sales.filter(
    (sale) => new Date(sale.createdAt).getTime() >= cutoff,
  );
  const revenue = sales.reduce((sum, sale) => sum + sale.total, 0);
  const cost = sales.reduce(
    (sum, sale) =>
      sum +
      sale.items.reduce(
        (itemSum, item) => itemSum + item.cost * item.quantity,
        0,
      ),
    0,
  );
  const profit = revenue - cost;
  const expenses = state.expenses
    .filter((expense) => new Date(expense.date).getTime() >= cutoff)
    .reduce((sum, expense) => sum + expense.amount, 0);
  const inventoryValue = state.products.reduce(
    (sum, product) => sum + product.stock * product.cost,
    0,
  );

  const chartData = useMemo(() => {
    const days = period === "7" ? 7 : period === "30" ? 30 : 45;
    return Array.from({ length: days }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (days - index - 1));
      const value = state.sales
        .filter(
          (sale) =>
            new Date(sale.createdAt).toDateString() === date.toDateString(),
        )
        .reduce((sum, sale) => sum + sale.total, 0);
      return {
        label: new Intl.DateTimeFormat(bootstrap.organization.locale, {
          day: days > 7 ? "numeric" : undefined,
          month: days > 7 ? "short" : undefined,
          weekday: days <= 7 ? "short" : undefined,
        }).format(date),
        revenue: value,
      };
    });
  }, [bootstrap.organization.locale, period, state.sales]);

  const categoryRevenue = useMemo(() => {
    const categories = new Map<string, number>();
    sales.forEach((sale) =>
      sale.items.forEach((item) => {
        const product = state.products.find(
          (entry) => entry.id === item.productId,
        );
        const category = product?.category ?? "Other";
        categories.set(
          category,
          (categories.get(category) ?? 0) + item.unitPrice * item.quantity,
        );
      }),
    );
    return [...categories.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [sales, state.products]);

  const paymentMix = ["Cash", "Card", "Transfer"].map((method) => ({
    method,
    value: sales
      .filter((sale) => sale.paymentMethod === method)
      .reduce((sum, sale) => sum + sale.total, 0),
  }));

  const transactionReport = useMemo(() => {
    const query = transactionQuery.trim().toLowerCase();
    return sales.filter((sale) => {
      const date = sale.createdAt.slice(0, 10);
      const matchesQuery = !query || [sale.id, sale.customerName, sale.cashier, sale.paymentMethod, ...sale.items.map((item) => item.name)].join(" ").toLowerCase().includes(query);
      return matchesQuery && (!fromDate || date >= fromDate) && (!toDate || date <= toDate);
    });
  }, [fromDate, sales, toDate, transactionQuery]);

  const exportReport = () =>
    downloadCsv(`${bootstrap.organization.slug}-report.csv`, [
      ["Metric", "Value"],
      ["Revenue", revenue],
      ["Gross profit", profit],
      ["Expenses", expenses],
      ["Net result", profit - expenses],
      ["Inventory value", inventoryValue],
      [],
      ["Category", "Revenue"],
      ...categoryRevenue.map((item) => [item.name, item.value]),
      [],
      ["Receipt", "Date", "Time", "Product", "Quantity", "Unit price", "Total", "Payment", "Cashier"],
      ...transactionReport.flatMap((sale) => sale.items.map((item) => [
        sale.id,
        formatDate(new Date(sale.createdAt)),
        formatTime(sale.createdAt),
        item.name,
        item.quantity,
        item.unitPrice,
        sale.total,
        sale.paymentMethod,
        sale.cashier,
      ])),
    ]);

  return (
    <Workspace>
      {offline && <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">Offline report based on records saved on this device. Totals may be incomplete until reconnect.</p>}
      <PageHeader
        eyebrow="Business intelligence"
        title="Reports"
        description="Understand revenue, gross profit, operating expenses, and product performance in one clear view."
        actions={
          <>
            <Select
              value={period}
              onChange={setPeriod}
              ariaLabel="Report period"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="all">All records</option>
            </Select>
            <ExportButton onClick={exportReport} label="Export report" />
          </>
        }
      />
      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile
          label="Revenue"
          value={formatCurrency(revenue)}
          detail={`${sales.length} transactions in range`}
          icon={CircleDollarSign}
          tone="green"
        />
        <StatTile
          label="Gross profit"
          value={formatCurrency(profit)}
          detail={`${revenue ? Math.round((profit / revenue) * 100) : 0}% estimated margin`}
          icon={TrendingUp}
        />
        <StatTile
          label="Operating expenses"
          value={formatCurrency(expenses)}
          detail="Recorded expenses in range"
          icon={WalletCards}
          tone="red"
        />
        <StatTile
          label="Net result"
          value={formatCurrency(profit - expenses)}
          detail={`Inventory: ${formatCurrency(inventoryValue)}`}
          icon={ShoppingBag}
          tone={profit - expenses >= 0 ? "green" : "red"}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Revenue trend</CardTitle>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Daily completed sales
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <div
              role="img"
              aria-label={`Revenue chart for ${period === "all" ? "all records" : `the last ${period} days`}`}
              className="h-[320px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 8, right: 4, left: -18, bottom: 0 }}
                >
                  <CartesianGrid
                    vertical={false}
                    stroke="var(--chart-grid)"
                    strokeDasharray="3 4"
                  />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    minTickGap={25}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    tickFormatter={(value) => formatCurrency(value, true)}
                  />
                  <Tooltip
                    formatter={(value) => [
                      formatCurrency(Number(value)),
                      "Revenue",
                    ]}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      color: "var(--foreground)",
                      fontSize: 11,
                    }}
                  />
                  <Bar
                    dataKey="revenue"
                    fill="var(--chart)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={34}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Revenue by category</CardTitle>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Contribution to selected period
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {categoryRevenue.map((item) => {
              const share = revenue ? (item.value / revenue) * 100 : 0;
              return (
                <div key={item.name}>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-medium">{item.name}</span>
                    <span className="font-bold">
                      {formatCurrency(item.value)}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-subtle)]">
                    <div
                      className="h-full rounded-full bg-[var(--primary)]"
                      style={{ width: `${Math.max(2, share)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-right text-[10px] text-[var(--muted-foreground)]">
                    {share.toFixed(1)}%
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {paymentMix.map((item) => {
          const Icon =
            item.method === "Cash"
              ? CircleDollarSign
              : item.method === "Card"
                ? WalletCards
                : Building2;
          return (
            <Card key={item.method} className="p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary-soft-foreground)]">
                  <Icon className="size-4" />
                </span>
                <div>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {item.method} payments
                  </p>
                  <p className="mt-1 text-lg font-bold">
                    {formatCurrency(item.value)}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </section>

      <section className="mt-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
          <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-sm font-bold">Transaction detail</h2>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">Searchable line-item records for the selected reporting period.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input className={inputClass + " h-9 w-48"} placeholder="Search receipt, product, cashier" value={transactionQuery} onChange={(event) => setTransactionQuery(event.target.value)} />
              <input aria-label="Transactions from date" type="date" className={inputClass + " h-9 w-auto"} value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
              <input aria-label="Transactions to date" type="date" className={inputClass + " h-9 w-auto"} value={toDate} onChange={(event) => setToDate(event.target.value)} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-xs">
              <thead><tr className="bg-[var(--surface-subtle)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]"><th className="px-4 py-3">Date / time</th><th className="px-4 py-3">Receipt</th><th className="px-4 py-3">Product</th><th className="px-4 py-3">Qty</th><th className="px-4 py-3">Unit price</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3">Cashier</th></tr></thead>
              <tbody>
                {transactionReport.flatMap((sale) => sale.items.map((item) => <tr key={`${sale.id}-${item.productId}`} className="border-t border-[var(--border)]"><td className="px-4 py-3">{formatDate(new Date(sale.createdAt))}<span className="ml-1 text-[var(--muted-foreground)]">{formatTime(sale.createdAt)}</span></td><td className="px-4 py-3 font-semibold">{sale.id}</td><td className="px-4 py-3">{item.name}<span className="ml-1 text-[var(--muted-foreground)]">{item.sku}</span></td><td className="px-4 py-3">{item.quantity}</td><td className="px-4 py-3">{formatCurrency(item.unitPrice)}</td><td className="px-4 py-3 font-semibold">{formatCurrency(sale.total)}</td><td className="px-4 py-3">{sale.paymentMethod}</td><td className="px-4 py-3">{sale.cashier}</td></tr>))}
                {!transactionReport.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-[var(--muted-foreground)]">No transactions match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </Workspace>
  );
}

export function AlertsPage() {
  const { offline } = usePlatform();
  const {
    notifications: allNotifications,
    markRead: markNotificationRead,
    markAllRead: markAllNotificationsRead,
    dismiss: dismissNotification,
  } = useNotifications();
  const [filter, setFilter] = useState("all");
  const notifications = allNotifications.filter(
    (notification) =>
      filter === "all" ||
      (filter === "unread" && notification.unread) ||
      notification.tone === filter,
  );
  const unread = allNotifications.filter(
    (notification) => notification.unread,
  ).length;

  const toneDetails = {
    warning: {
      icon: AlertTriangle,
      className: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    },
    info: {
      icon: Info,
      className: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    },
    success: {
      icon: Check,
      className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    },
  };

  return (
    <Workspace size="medium">
      {offline && <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">Showing saved notifications. Read and dismiss actions need a connection.</p>}
      <PageHeader
        eyebrow="Activity"
        title="Notification center"
        description="Review stock warnings, transaction updates, and important operational events."
        actions={
          <Button
            variant="secondary"
            disabled={offline || unread === 0}
            onClick={markAllNotificationsRead}
          >
            <CheckCheck className="size-4" /> Mark all read
          </Button>
        }
      />
      <section className="grid grid-cols-2 gap-3 [&>*:last-child]:col-span-2 sm:grid-cols-3 sm:gap-4 sm:[&>*:last-child]:col-span-1">
        <StatTile
          label="All notifications"
          value={String(allNotifications.length)}
          detail="Stored activity"
          icon={Bell}
        />
        <StatTile
          label="Unread"
          value={String(unread)}
          detail="Needs your attention"
          icon={AlertTriangle}
          tone="amber"
        />
        <StatTile
          label="Stock warnings"
          value={String(
            allNotifications.filter(
              (notification) => notification.tone === "warning",
            ).length,
          )}
          detail="Inventory-related alerts"
          icon={PackageCheck}
          tone="red"
        />
      </section>

      <Card className="overflow-hidden">
        <div className="flex gap-1 overflow-x-auto border-b border-[var(--border)] p-3">
          {[
            ["all", "All"],
            ["unread", "Unread"],
            ["warning", "Warnings"],
            ["info", "Information"],
            ["success", "Completed"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              onClick={() => setFilter(value)}
              className={cn(
                "h-8 shrink-0 rounded-lg px-3 text-[11px] font-semibold",
                filter === value
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {notifications.length ? (
          <div className="divide-y divide-[var(--border)]">
            {notifications.map((notification) => {
              const detail = toneDetails[notification.tone];
              const Icon = detail.icon;
              return (
                <article
                  key={notification.id}
                  className={cn(
                    "flex gap-4 p-4 sm:p-5",
                    notification.unread && "bg-[var(--primary-soft)]/30",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-lg",
                      detail.className,
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <h2 className="text-sm font-semibold">
                        {notification.title}
                      </h2>
                      {notification.unread && (
                        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--primary)]" />
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--muted-foreground)]">
                      {notification.body}
                    </p>
                    <p className="mt-2 text-[10px] text-[var(--muted-foreground)]">
                      {formatDate(new Date(notification.createdAt))} ·{" "}
                      {formatTime(notification.createdAt)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {!offline && <Button
                        asChild
                        size="sm"
                        variant="secondary"
                        onClick={() => markNotificationRead(notification.id)}
                      >
                        <Link href={notification.href}>View related page</Link>
                      </Button>}
                      {notification.unread && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={offline}
                          onClick={() =>
                            markNotificationRead(notification.id)
                          }
                        >
                          Mark read
                        </Button>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={offline}
                    className="size-8 shrink-0"
                    onClick={() => dismissNotification(notification.id)}
                    aria-label={`Dismiss ${notification.title}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="grid min-h-80 place-items-center p-8 text-center">
            <div>
              <BellOff className="mx-auto size-8 text-[var(--muted-foreground)]" />
              <p className="mt-3 text-sm font-semibold">No notifications here</p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Try another filter or enjoy the quiet.
              </p>
            </div>
          </div>
        )}
      </Card>
    </Workspace>
  );
}

export function SettingsPage() {
  const {
    bootstrap,
    currentLocation,
    applyCompanySettings,
    offline,
  } = usePlatform();
  const primaryLocation =
    bootstrap.locations.find((location) => location.is_primary) ??
    currentLocation;
  const address = primaryLocation.address;
  const [saved, setSaved] = useState(false);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [pendingAction, setPendingAction] = useState<
    "settings" | "logo" | "remove-logo" | null
  >(null);
  const [form, setForm] = useState<CompanySettingsInput>(() => ({
    name: bootstrap.organization.name,
    primary_color: bootstrap.branding.primary_color,
    currency: bootstrap.organization.currency,
    job_cards_enabled: Boolean(bootstrap.organization.job_cards_enabled),
    receipt_header: bootstrap.branding.receipt_header,
    receipt_footer: bootstrap.branding.receipt_footer,
    address: {
      line1: address.line1 ?? "",
      line2: address.line2 ?? "",
      city: address.city ?? "",
      state: address.state ?? "",
      postal_code: address.postal_code ?? "",
      country: address.country ?? "Nigeria",
    },
  }));
  const isOwner = Boolean(bootstrap.membership?.is_owner);
  const canEdit = isOwner && !offline;
  const mutation = useMutation({
    mutationFn: platformApi.updateCompanySettings,
    onSuccess: (settings) => {
      applyCompanySettings(settings);
      setForm({
        name: settings.organization.name,
        primary_color: settings.branding.primary_color,
        currency: settings.organization.currency,
        job_cards_enabled: Boolean(settings.organization.job_cards_enabled),
        receipt_header: settings.branding.receipt_header,
        receipt_footer: settings.branding.receipt_footer,
        address: {
          line1: settings.primary_location.address.line1 ?? "",
          line2: settings.primary_location.address.line2 ?? "",
          city: settings.primary_location.address.city ?? "",
          state: settings.primary_location.address.state ?? "",
          postal_code:
            settings.primary_location.address.postal_code ?? "",
          country: settings.primary_location.address.country ?? "",
        },
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 3000);
    },
    onError: (error) => {
      if (
        error instanceof PlatformApiError &&
        error.status === 403 &&
        error.message.toLowerCase().includes("reauthenticate")
      ) {
        setPendingAction("settings");
        setReauthOpen(true);
      }
    },
  });
  const logoMutation = useMutation({
    mutationFn: (file: File) => platformApi.uploadCompanyLogo(file),
    onSuccess: (settings) => {
      applyCompanySettings(settings);
      setLogoFile(null);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 3000);
    },
    onError: (error) => {
      if (
        error instanceof PlatformApiError &&
        error.status === 403 &&
        error.message.toLowerCase().includes("reauthenticate")
      ) {
        setPendingAction("logo");
        setReauthOpen(true);
      }
    },
  });
  const removeLogoMutation = useMutation({
    mutationFn: platformApi.removeCompanyLogo,
    onSuccess: (settings) => {
      applyCompanySettings(settings);
      setLogoFile(null);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 3000);
    },
    onError: (error) => {
      if (
        error instanceof PlatformApiError &&
        error.status === 403 &&
        error.message.toLowerCase().includes("reauthenticate")
      ) {
        setPendingAction("remove-logo");
        setReauthOpen(true);
      }
    },
  });
  const reauthentication = useMutation({
    mutationFn: () => platformApi.reauthenticate(password),
    onSuccess: () => {
      const action = pendingAction;
      setPassword("");
      setPendingAction(null);
      setReauthOpen(false);
      if (action === "logo" && logoFile) {
        logoMutation.reset();
        logoMutation.mutate(logoFile);
      } else if (action === "remove-logo") {
        removeLogoMutation.reset();
        removeLogoMutation.mutate();
      } else {
        mutation.reset();
        mutation.mutate(form);
      }
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (canEdit) mutation.mutate(form);
  };

  const confirmIdentity = (event: FormEvent) => {
    event.preventDefault();
    if (password && !offline) reauthentication.mutate();
  };

  const updateAddress = (
    key: keyof CompanySettingsInput["address"],
    value: string,
  ) => {
    setForm((current) => ({
      ...current,
      address: { ...current.address, [key]: value },
    }));
  };

  return (
    <Workspace size="medium">
      {offline && <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">Company settings are read-only offline. Changes can be saved after reconnecting.</p>}
      <PageHeader
        eyebrow="Company"
        title="Company settings"
        description="Manage the company identity used throughout this workspace and on future receipts."
      />

      {!isOwner && (
        <Card className="mb-4 border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 p-4">
            <Info className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold">Owner access required</p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                You can view these details, but only the company owner can
                change them.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mb-4"><PwaInstallCard /></div>

      <form onSubmit={submit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Repair services</CardTitle>
          </CardHeader>
          <CardContent>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={form.job_cards_enabled}
                disabled={!canEdit}
                onChange={(event) => setForm({ ...form, job_cards_enabled: event.target.checked })}
                className="mt-1 size-4"
              />
              <span>
                <span className="block font-medium">Enable job cards</span>
                <span className="block text-xs text-[var(--muted-foreground)]">
                  Track gadget repairs, payments, status, and printable customer copies.
                </span>
              </span>
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary-soft-foreground)]">
                <Building2 className="size-4" />
              </span>
              <div>
                <CardTitle>Company identity</CardTitle>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  Changes appear across the application immediately.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-4 rounded-lg border border-[var(--border)] bg-[var(--background)] p-4 sm:col-span-2 sm:flex-row sm:items-center">
              <TenantLogo
                src={bootstrap.branding.logo_url}
                alt={`${bootstrap.branding.display_name} logo`}
                className="size-16 shrink-0 place-items-center rounded-xl bg-[var(--primary-soft)] p-2 text-[var(--primary-soft-foreground)]"
                fallback={
                  <Building2 className="size-7" aria-hidden="true" />
                }
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Business logo</p>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  PNG, JPEG, WebP, or SVG. Maximum file size: 2 MB.
                </p>
                {logoFile && (
                  <p className="mt-2 truncate text-xs font-medium text-[var(--primary)]">
                    Selected: {logoFile.name}
                  </p>
                )}
              </div>
              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-semibold hover:bg-[var(--surface-hover)] focus-within:ring-2 focus-within:ring-[var(--ring)]">
                    <ImagePlus className="size-3.5" />
                    Choose logo
                    <input
                      type="file"
                      className="sr-only"
                      accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={(event) =>
                        setLogoFile(event.target.files?.[0] ?? null)
                      }
                    />
                  </label>
                  {logoFile && (
                    <Button
                      type="button"
                      size="sm"
                      disabled={logoMutation.isPending}
                      onClick={() => logoMutation.mutate(logoFile)}
                    >
                      {logoMutation.isPending ? "Uploading…" : "Upload"}
                    </Button>
                  )}
                  {bootstrap.branding.logo_url && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={removeLogoMutation.isPending}
                      onClick={() => removeLogoMutation.mutate()}
                    >
                      <Trash2 className="size-3.5" />
                      Remove
                    </Button>
                  )}
                </div>
              )}
            </div>
            {(logoMutation.error || removeLogoMutation.error) &&
              !reauthOpen && (
                <p
                  role="alert"
                  className="text-sm text-red-600 dark:text-red-400 sm:col-span-2"
                >
                  {(logoMutation.error ?? removeLogoMutation.error)?.message}
                </p>
              )}
            <FormField label="Company name" className="sm:col-span-2">
              <input
                required
                disabled={!canEdit}
                className={inputClass}
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </FormField>

            <FormField label="Primary brand colour">
              <div className="flex gap-2">
                <input
                  type="color"
                  disabled={!canEdit}
                  aria-label="Choose primary brand colour"
                  value={form.primary_color}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      primary_color: event.target.value.toUpperCase(),
                    })
                  }
                  className="h-10 w-12 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1"
                />
                <input
                  required
                  disabled={!canEdit}
                  pattern="#[0-9A-Fa-f]{6}"
                  className={inputClass}
                  value={form.primary_color}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      primary_color: event.target.value.toUpperCase(),
                    })
                  }
                />
              </div>
            </FormField>

            <FormField label="Currency">
              <input
                required
                disabled={!canEdit}
                maxLength={3}
                pattern="[A-Za-z]{3}"
                list="currency-codes"
                className={inputClass}
                value={form.currency}
                onChange={(event) =>
                  setForm({
                    ...form,
                    currency: event.target.value.toUpperCase(),
                  })
                }
              />
              <datalist id="currency-codes">
                {["NGN", "USD", "GBP", "EUR", "GHS", "KES", "ZAR"].map(
                  (currency) => (
                    <option key={currency} value={currency} />
                  ),
                )}
              </datalist>
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Primary address</CardTitle>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                This is the address of {primaryLocation.name}.
              </p>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField label="Address line 1" className="sm:col-span-2">
              <input
                required
                disabled={!canEdit}
                className={inputClass}
                value={form.address.line1}
                onChange={(event) =>
                  updateAddress("line1", event.target.value)
                }
              />
            </FormField>
            <FormField label="Address line 2" className="sm:col-span-2">
              <input
                disabled={!canEdit}
                className={inputClass}
                value={form.address.line2 ?? ""}
                onChange={(event) =>
                  updateAddress("line2", event.target.value)
                }
              />
            </FormField>
            <FormField label="City">
              <input
                disabled={!canEdit}
                className={inputClass}
                value={form.address.city ?? ""}
                onChange={(event) =>
                  updateAddress("city", event.target.value)
                }
              />
            </FormField>
            <FormField label="State / region">
              <input
                disabled={!canEdit}
                className={inputClass}
                value={form.address.state ?? ""}
                onChange={(event) =>
                  updateAddress("state", event.target.value)
                }
              />
            </FormField>
            <FormField label="Postal code">
              <input
                disabled={!canEdit}
                className={inputClass}
                value={form.address.postal_code ?? ""}
                onChange={(event) =>
                  updateAddress("postal_code", event.target.value)
                }
              />
            </FormField>
            <FormField label="Country">
              <input
                required
                disabled={!canEdit}
                className={inputClass}
                value={form.address.country}
                onChange={(event) =>
                  updateAddress("country", event.target.value)
                }
              />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Receipt content</CardTitle>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Applied to receipts created after this update.
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField label="Receipt header">
              <input
                disabled={!canEdit}
                className={inputClass}
                value={form.receipt_header}
                onChange={(event) =>
                  setForm({ ...form, receipt_header: event.target.value })
                }
              />
            </FormField>
            <FormField label="Receipt footer">
              <textarea
                disabled={!canEdit}
                rows={3}
                className={`${inputClass} h-auto py-2.5`}
                value={form.receipt_footer}
                onChange={(event) =>
                  setForm({ ...form, receipt_footer: event.target.value })
                }
              />
            </FormField>
          </CardContent>
        </Card>

        {mutation.error && !reauthOpen && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {mutation.error.message}
          </p>
        )}
        {saved && (
          <p role="status" className="text-sm text-emerald-600">
            Company settings saved and applied.
          </p>
        )}

        {canEdit && (
          <div className="flex justify-end">
            <Button type="submit" disabled={mutation.isPending}>
              <Save className="size-4" />
              {mutation.isPending ? "Saving…" : "Save company settings"}
            </Button>
          </div>
        )}
      </form>

      <Modal
        open={reauthOpen}
        onOpenChange={(open) => {
          if (reauthentication.isPending) return;
          setReauthOpen(open);
          if (!open) {
            setPassword("");
            setPendingAction(null);
            reauthentication.reset();
          }
        }}
        title="Confirm it’s you"
        description="Sensitive company changes require a recent password confirmation."
        size="sm"
      >
        <form onSubmit={confirmIdentity}>
          <div className="space-y-4 px-5 py-5">
            <div className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--primary)]" />
              <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
                Enter your current password. It is used only to refresh this
                secure session and is never stored in the browser.
              </p>
            </div>
            <FormField label="Current password">
              <input
                autoFocus
                required
                type="password"
                autoComplete="current-password"
                className={inputClass}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </FormField>
            {reauthentication.error && (
              <p
                role="alert"
                className="text-sm text-red-600 dark:text-red-400"
              >
                {reauthentication.error.message}
              </p>
            )}
          </div>
          <ModalFooter>
            <Button
              type="button"
              variant="secondary"
              disabled={reauthentication.isPending}
              onClick={() => setReauthOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={offline || reauthentication.isPending}>
              <ShieldCheck className="size-4" />
              {reauthentication.isPending
                ? "Confirming…"
                : "Confirm and save"}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </Workspace>
  );
}
