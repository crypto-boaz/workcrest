"use client";

import {
  Banknote,
  CircleDollarSign,
  CreditCard,
  Eye,
  Plus,
  ReceiptText,
  ShoppingBag,
  UserPlus,
  Users,
  WalletCards,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import { useBusinessStore } from "@/components/business-store-provider";
import { usePlatform } from "@/components/platform-provider";
import { Button } from "@/components/ui/button";
import type { Customer, CustomerInput, Sale } from "@/lib/business-types";
import { formatCurrency, formatDate, formatTime } from "@/lib/utils";
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
  StatusBadge,
  TableShell,
  Toolbar,
  Workspace,
} from "@/components/workspace/workspace-ui";

export function SalesPage() {
  const { state } = useBusinessStore();
  const { bootstrap } = usePlatform();
  const [query, setQuery] = useState("");
  const [payment, setPayment] = useState("all");
  const [selected, setSelected] = useState<Sale | null>(null);

  const filtered = useMemo(
    () =>
      state.sales.filter(
        (sale) =>
          [sale.id, sale.customerName, sale.cashier]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (payment === "all" || sale.paymentMethod === payment),
      ),
    [payment, query, state.sales],
  );
  const today = new Date().toDateString();
  const todaysSales = state.sales.filter(
    (sale) => new Date(sale.createdAt).toDateString() === today,
  );
  const todayTotal = todaysSales.reduce((sum, sale) => sum + sale.total, 0);
  const avgOrder = state.sales.length
    ? state.sales.reduce((sum, sale) => sum + sale.total, 0) /
      state.sales.length
    : 0;
  const profit = state.sales.reduce(
    (sum, sale) =>
      sum +
      sale.items.reduce(
        (itemSum, item) =>
          itemSum + (item.unitPrice - item.cost) * item.quantity,
        0,
      ) -
      sale.discount,
    0,
  );

  const exportSales = () =>
    downloadCsv(`${bootstrap.organization.slug}-sales.csv`, [
      ["Transaction", "Date", "Customer", "Payment", "Status", "Total"],
      ...filtered.map((sale) => [
        sale.id,
        sale.createdAt,
        sale.customerName,
        sale.paymentMethod,
        sale.status,
        sale.total,
      ]),
    ]);

  return (
    <Workspace>
      <PageHeader
        eyebrow="Revenue"
        title="Sales"
        description="Review every completed checkout, payment method, and item-level transaction detail."
        actions={<ExportButton onClick={exportSales} />}
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Today’s revenue"
          value={formatCurrency(todayTotal)}
          detail={`${todaysSales.length} completed transactions`}
          icon={CircleDollarSign}
          tone="green"
        />
        <StatTile
          label="All transactions"
          value={state.sales.length.toLocaleString()}
          detail="Across the mock data period"
          icon={ReceiptText}
        />
        <StatTile
          label="Average order"
          value={formatCurrency(avgOrder)}
          detail="Average checkout value"
          icon={ShoppingBag}
          tone="amber"
        />
        <StatTile
          label="Gross profit"
          value={formatCurrency(profit)}
          detail="Revenue less item costs"
          icon={WalletCards}
          tone="green"
        />
      </section>

      <TableShell>
        <Toolbar
          query={query}
          onQueryChange={setQuery}
          placeholder="Search transaction, customer, or cashier"
        >
          <Select
            value={payment}
            onChange={setPayment}
            ariaLabel="Filter sales by payment method"
          >
            <option value="all">All payments</option>
            <option value="Cash">Cash</option>
            <option value="Card">Card</option>
            <option value="Transfer">Transfer</option>
          </Select>
          <span className="text-[11px] text-[var(--muted-foreground)]">
            {filtered.length} records
          </span>
        </Toolbar>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead>
              <tr className="bg-[var(--surface-subtle)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
                <th className="px-5 py-3 font-semibold">Transaction</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Items</th>
                <th className="px-4 py-3 font-semibold">Payment</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Total</th>
                <th className="px-5 py-3 text-right font-semibold">View</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((sale) => (
                <tr
                  key={sale.id}
                  className="border-t border-[var(--border)] hover:bg-[var(--surface-subtle)]"
                >
                  <td className="px-5 py-3.5">
                    <p className="font-semibold">{sale.id}</p>
                    <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
                      {formatDate(new Date(sale.createdAt))} ·{" "}
                      {formatTime(sale.createdAt)}
                    </p>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-medium">{sale.customerName}</p>
                    <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
                      {sale.cashier}
                    </p>
                  </td>
                  <td className="px-4 py-3.5 text-[var(--muted-foreground)]">
                    {sale.items.reduce(
                      (sum, item) => sum + item.quantity,
                      0,
                    )}{" "}
                    units
                  </td>
                  <td className="px-4 py-3.5">{sale.paymentMethod}</td>
                  <td className="px-4 py-3.5">
                    <StatusBadge
                      tone={sale.status === "completed" ? "green" : "neutral"}
                    >
                      {sale.status}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold">
                    {formatCurrency(sale.total)}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => setSelected(sale)}
                      aria-label={`View ${sale.id}`}
                    >
                      <Eye className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TableShell>

      <Modal
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
        title={selected?.id ?? "Transaction"}
        description={
          selected
            ? `${formatDate(new Date(selected.createdAt))} at ${formatTime(selected.createdAt)}`
            : undefined
        }
      >
        {selected && (
          <div className="p-5">
            <div className="flex items-center justify-between rounded-lg bg-[var(--surface-subtle)] p-3 text-xs">
              <div>
                <p className="text-[10px] text-[var(--muted-foreground)]">
                  Customer
                </p>
                <p className="mt-1 font-semibold">{selected.customerName}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-[var(--muted-foreground)]">
                  Payment
                </p>
                <p className="mt-1 font-semibold">{selected.paymentMethod}</p>
              </div>
            </div>
            <div className="mt-4 divide-y divide-[var(--border)]">
              {selected.items.map((item) => (
                <div key={item.productId} className="flex gap-4 py-3 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{item.name}</p>
                    <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
                      {item.quantity} × {formatCurrency(item.unitPrice)}
                    </p>
                  </div>
                  <p className="font-bold">
                    {formatCurrency(item.unitPrice * item.quantity)}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3 text-xs">
              <div className="flex justify-between text-[var(--muted-foreground)]">
                <span>Subtotal</span>
                <span>{formatCurrency(selected.subtotal)}</span>
              </div>
              <div className="flex justify-between text-[var(--muted-foreground)]">
                <span>Discount</span>
                <span>-{formatCurrency(selected.discount)}</span>
              </div>
              <div className="flex justify-between pt-1 text-base font-bold">
                <span>Total</span>
                <span>{formatCurrency(selected.total)}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </Workspace>
  );
}

const emptyCustomer: CustomerInput = {
  name: "",
  phone: "",
  email: "",
  outstanding: 0,
};

export function CustomersPage() {
  const { state, addCustomer } = useBusinessStore();
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerInput>(emptyCustomer);

  const filtered = state.customers.filter((customer) =>
    [customer.name, customer.phone, customer.email]
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const totalSpent = state.customers.reduce(
    (sum, customer) => sum + customer.totalSpent,
    0,
  );
  const outstanding = state.customers.reduce(
    (sum, customer) => sum + customer.outstanding,
    0,
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    addCustomer(form);
    setForm(emptyCustomer);
    setModalOpen(false);
  };

  return (
    <Workspace>
      <PageHeader
        eyebrow="Relationships"
        title="Customers"
        description="Keep customer contact details, purchase history, and outstanding balances organised."
        actions={
          <Button onClick={() => setModalOpen(true)}>
            <UserPlus className="size-4" /> Add customer
          </Button>
        }
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Total customers"
          value={state.customers.length.toLocaleString()}
          detail="Known customer profiles"
          icon={Users}
        />
        <StatTile
          label="Customer revenue"
          value={formatCurrency(totalSpent)}
          detail="Lifetime recorded spend"
          icon={CircleDollarSign}
          tone="green"
        />
        <StatTile
          label="Outstanding debt"
          value={formatCurrency(outstanding)}
          detail={`${state.customers.filter((customer) => customer.outstanding > 0).length} active balances`}
          icon={CreditCard}
          tone="amber"
        />
        <StatTile
          label="Average spend"
          value={formatCurrency(
            state.customers.length ? totalSpent / state.customers.length : 0,
          )}
          detail="Per registered customer"
          icon={Banknote}
          tone="green"
        />
      </section>

      <TableShell>
        <Toolbar
          query={query}
          onQueryChange={setQuery}
          placeholder="Search customer name, phone, or email"
        >
          <span className="text-[11px] text-[var(--muted-foreground)]">
            {filtered.length} customers
          </span>
        </Toolbar>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead>
              <tr className="bg-[var(--surface-subtle)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
                <th className="px-5 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Contact</th>
                <th className="px-4 py-3 text-right font-semibold">Orders</th>
                <th className="px-4 py-3 text-right font-semibold">
                  Total spent
                </th>
                <th className="px-4 py-3 text-right font-semibold">Balance</th>
                <th className="px-5 py-3 text-right font-semibold">Profile</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((customer) => (
                <tr
                  key={customer.id}
                  className="border-t border-[var(--border)] hover:bg-[var(--surface-subtle)]"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 place-items-center rounded-full bg-[var(--primary-soft)] text-xs font-bold text-[var(--primary-soft-foreground)]">
                        {customer.name
                          .split(" ")
                          .map((part) => part[0])
                          .slice(0, 2)
                          .join("")}
                      </span>
                      <div>
                        <p className="font-semibold">{customer.name}</p>
                        <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
                          Since {formatDate(new Date(customer.createdAt))}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <p>{customer.phone}</p>
                    <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
                      {customer.email}
                    </p>
                  </td>
                  <td className="px-4 py-3.5 text-right font-semibold">
                    {customer.orders}
                  </td>
                  <td className="px-4 py-3.5 text-right font-semibold">
                    {formatCurrency(customer.totalSpent)}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span
                      className={
                        customer.outstanding > 0
                          ? "font-bold text-amber-700 dark:text-amber-400"
                          : "text-[var(--muted-foreground)]"
                      }
                    >
                      {formatCurrency(customer.outstanding)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => setSelected(customer)}
                      aria-label={`View ${customer.name}`}
                    >
                      <Eye className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TableShell>

      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title="Add customer"
        description="Customer profiles can be selected during checkout."
      >
        <form onSubmit={submit}>
          <div className="space-y-4 p-5">
            <FormField label="Full name">
              <input
                required
                className={inputClass}
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                placeholder="Customer name"
              />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Phone">
                <input
                  required
                  className={inputClass}
                  value={form.phone}
                  onChange={(event) =>
                    setForm({ ...form, phone: event.target.value })
                  }
                  placeholder="0800 000 0000"
                />
              </FormField>
              <FormField label="Email">
                <input
                  type="email"
                  className={inputClass}
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                  placeholder="name@example.com"
                />
              </FormField>
            </div>
            <FormField
              label="Opening balance (₦)"
              hint="Optional amount already owed by this customer."
            >
              <input
                min="0"
                type="number"
                className={inputClass}
                value={form.outstanding || ""}
                onChange={(event) =>
                  setForm({
                    ...form,
                    outstanding: Number(event.target.value),
                  })
                }
              />
            </FormField>
          </div>
          <ModalFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit">
              <Plus className="size-4" /> Add customer
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      <Modal
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
        title={selected?.name ?? "Customer"}
        description={selected?.email}
      >
        {selected && (
          <div className="p-5">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-[var(--surface-subtle)] p-3">
                <p className="text-[10px] text-[var(--muted-foreground)]">
                  Orders
                </p>
                <p className="mt-1 text-base font-bold">{selected.orders}</p>
              </div>
              <div className="rounded-lg bg-[var(--surface-subtle)] p-3">
                <p className="text-[10px] text-[var(--muted-foreground)]">
                  Total spent
                </p>
                <p className="mt-1 text-sm font-bold">
                  {formatCurrency(selected.totalSpent)}
                </p>
              </div>
              <div className="rounded-lg bg-[var(--surface-subtle)] p-3">
                <p className="text-[10px] text-[var(--muted-foreground)]">
                  Balance
                </p>
                <p className="mt-1 text-sm font-bold">
                  {formatCurrency(selected.outstanding)}
                </p>
              </div>
            </div>
            <h3 className="mt-5 text-xs font-semibold">Recent transactions</h3>
            <div className="mt-2 divide-y divide-[var(--border)]">
              {state.sales
                .filter((sale) => sale.customerId === selected.id)
                .slice(0, 5)
                .map((sale) => (
                  <div
                    key={sale.id}
                    className="flex items-center gap-3 py-3 text-xs"
                  >
                    <ReceiptText className="size-4 text-[var(--muted-foreground)]" />
                    <div className="flex-1">
                      <p className="font-semibold">{sale.id}</p>
                      <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
                        {formatDate(new Date(sale.createdAt))}
                      </p>
                    </div>
                    <strong>{formatCurrency(sale.total)}</strong>
                  </div>
                ))}
              {!state.sales.some((sale) => sale.customerId === selected.id) && (
                <p className="py-8 text-center text-xs text-[var(--muted-foreground)]">
                  No linked sales yet.
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </Workspace>
  );
}
