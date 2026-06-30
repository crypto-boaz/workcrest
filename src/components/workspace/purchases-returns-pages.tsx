"use client";

import {
  ArrowDownToLine,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  PackageCheck,
  Plus,
  RotateCcw,
  Truck,
  Warehouse,
} from "lucide-react";
import { FormEvent, useState } from "react";

import { useBusinessStore } from "@/components/business-store-provider";
import { Button } from "@/components/ui/button";
import type { PurchaseInput, ReturnInput } from "@/lib/business-types";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  FormField,
  inputClass,
  Modal,
  ModalFooter,
  PageHeader,
  Select,
  StatTile,
  StatusBadge,
  TableShell,
  textareaClass,
  Toolbar,
  Workspace,
} from "@/components/workspace/workspace-ui";

function dateInput(daysAhead = 3) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

export function PurchasesPage() {
  const { state, createPurchase, receivePurchase, showToast } =
    useBusinessStore();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<PurchaseInput>({
    supplierId: state.suppliers[0]?.id ?? "",
    productId: state.products[0]?.id ?? "",
    quantity: 1,
    unitCost: state.products[0]?.cost ?? 0,
    expectedAt: dateInput(),
  });

  const filtered = state.purchases.filter(
    (purchase) =>
      [purchase.id, purchase.supplierName]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (status === "all" || purchase.status === status),
  );
  const orderedValue = state.purchases
    .filter((purchase) => purchase.status !== "received")
    .reduce((sum, purchase) => sum + purchase.total, 0);
  const supplierBalance = state.suppliers.reduce(
    (sum, supplier) => sum + supplier.balance,
    0,
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    try {
      createPurchase(form);
      setModalOpen(false);
    } catch (error) {
      showToast(
        "Purchase order not created",
        error instanceof Error ? error.message : undefined,
        "error",
      );
    }
  };

  return (
    <Workspace>
      <PageHeader
        eyebrow="Supply"
        title="Purchases"
        description="Create purchase orders, monitor supplier balances, and receive stock directly into inventory."
        actions={
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="size-4" /> New purchase order
          </Button>
        }
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Open orders"
          value={String(
            state.purchases.filter(
              (purchase) => purchase.status !== "received",
            ).length,
          )}
          detail="Awaiting delivery"
          icon={Truck}
          tone="amber"
        />
        <StatTile
          label="Ordered value"
          value={formatCurrency(orderedValue)}
          detail="Committed stock spend"
          icon={CircleDollarSign}
        />
        <StatTile
          label="Supplier balances"
          value={formatCurrency(supplierBalance)}
          detail={`${state.suppliers.length} active suppliers`}
          icon={CalendarClock}
          tone="red"
        />
        <StatTile
          label="Received orders"
          value={String(
            state.purchases.filter(
              (purchase) => purchase.status === "received",
            ).length,
          )}
          detail="Stock successfully updated"
          icon={PackageCheck}
          tone="green"
        />
      </section>

      <TableShell>
        <Toolbar
          query={query}
          onQueryChange={setQuery}
          placeholder="Search order or supplier"
        >
          <Select
            value={status}
            onChange={setStatus}
            ariaLabel="Filter purchase order status"
          >
            <option value="all">All statuses</option>
            <option value="ordered">Ordered</option>
            <option value="received">Received</option>
          </Select>
        </Toolbar>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-xs">
            <thead>
              <tr className="bg-[var(--surface-subtle)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
                <th className="px-5 py-3 font-semibold">Order</th>
                <th className="px-4 py-3 font-semibold">Supplier</th>
                <th className="px-4 py-3 font-semibold">Items</th>
                <th className="px-4 py-3 font-semibold">Expected</th>
                <th className="px-4 py-3 text-right font-semibold">Total</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((purchase) => (
                <tr
                  key={purchase.id}
                  className="border-t border-[var(--border)] hover:bg-[var(--surface-subtle)]"
                >
                  <td className="px-5 py-3.5">
                    <p className="font-semibold">{purchase.id}</p>
                    <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
                      {formatDate(new Date(purchase.createdAt))}
                    </p>
                  </td>
                  <td className="px-4 py-3.5 font-medium">
                    {purchase.supplierName}
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-medium">
                      {purchase.items[0]?.name}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
                      {purchase.items.reduce(
                        (sum, item) => sum + item.quantity,
                        0,
                      )}{" "}
                      units
                    </p>
                  </td>
                  <td className="px-4 py-3.5 text-[var(--muted-foreground)]">
                    {formatDate(new Date(purchase.expectedAt))}
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold">
                    {formatCurrency(purchase.total)}
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge
                      tone={purchase.status === "received" ? "green" : "amber"}
                    >
                      {purchase.status}
                    </StatusBadge>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {purchase.status !== "received" ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => receivePurchase(purchase.id)}
                      >
                        <ArrowDownToLine className="size-3.5" /> Receive
                      </Button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="size-3.5" /> In stock
                      </span>
                    )}
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
        title="New purchase order"
        description="Create an order now; receive it later to update stock."
      >
        <form onSubmit={submit}>
          <div className="space-y-4 p-5">
            <FormField label="Supplier">
              <select
                required
                className={inputClass}
                value={form.supplierId}
                onChange={(event) =>
                  setForm({ ...form, supplierId: event.target.value })
                }
              >
                {state.suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Product">
              <select
                required
                className={inputClass}
                value={form.productId}
                onChange={(event) => {
                  const product = state.products.find(
                    (entry) => entry.id === event.target.value,
                  );
                  setForm({
                    ...form,
                    productId: event.target.value,
                    unitCost: product?.cost ?? form.unitCost,
                  });
                }}
              >
                {state.products
                  .filter((product) => product.status === "active")
                  .map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} · {product.stock} in stock
                    </option>
                  ))}
              </select>
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Quantity">
                <input
                  required
                  min="1"
                  type="number"
                  className={inputClass}
                  value={form.quantity}
                  onChange={(event) =>
                    setForm({ ...form, quantity: Number(event.target.value) })
                  }
                />
              </FormField>
              <FormField label="Unit cost (₦)">
                <input
                  required
                  min="0"
                  type="number"
                  className={inputClass}
                  value={form.unitCost}
                  onChange={(event) =>
                    setForm({ ...form, unitCost: Number(event.target.value) })
                  }
                />
              </FormField>
            </div>
            <FormField label="Expected delivery">
              <input
                required
                type="date"
                className={inputClass}
                value={form.expectedAt.slice(0, 10)}
                onChange={(event) =>
                  setForm({ ...form, expectedAt: event.target.value })
                }
              />
            </FormField>
            <div className="flex justify-between rounded-lg bg-[var(--surface-subtle)] p-3 text-xs">
              <span className="text-[var(--muted-foreground)]">
                Order total
              </span>
              <strong>{formatCurrency(form.quantity * form.unitCost)}</strong>
            </div>
          </div>
          <ModalFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Create order</Button>
          </ModalFooter>
        </form>
      </Modal>
    </Workspace>
  );
}

export function ReturnsPage() {
  const { state, createReturn, showToast } = useBusinessStore();
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const firstSale = state.sales[0];
  const [form, setForm] = useState<ReturnInput>({
    saleId: firstSale?.id ?? "",
    productId: firstSale?.items[0]?.productId ?? "",
    quantity: 1,
    reason: "Damaged item",
  });

  const selectedSale = state.sales.find((sale) => sale.id === form.saleId);
  const filtered = state.returns.filter((record) =>
    [record.id, record.saleId, record.itemName, record.customerName]
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const returnValue = state.returns.reduce(
    (sum, record) => sum + record.amount,
    0,
  );
  const today = new Date().toDateString();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    try {
      createReturn(form);
      setModalOpen(false);
    } catch (error) {
      showToast(
        "Return could not be created",
        error instanceof Error ? error.message : undefined,
        "error",
      );
    }
  };

  return (
    <Workspace>
      <PageHeader
        eyebrow="After sales"
        title="Returns"
        description="Process item returns against original receipts and restore approved quantities to stock."
        actions={
          <Button onClick={() => setModalOpen(true)}>
            <RotateCcw className="size-4" /> Process return
          </Button>
        }
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Total returns"
          value={String(state.returns.length)}
          detail="Approved and pending records"
          icon={RotateCcw}
          tone="amber"
        />
        <StatTile
          label="Return value"
          value={formatCurrency(returnValue)}
          detail="Value of returned items"
          icon={CircleDollarSign}
          tone="red"
        />
        <StatTile
          label="Returned today"
          value={String(
            state.returns.filter(
              (record) => new Date(record.createdAt).toDateString() === today,
            ).length,
          )}
          detail="Today’s processed requests"
          icon={CalendarClock}
        />
        <StatTile
          label="Units restored"
          value={String(
            state.returns.reduce(
              (sum, record) => sum + record.quantity,
              0,
            ),
          )}
          detail="Added back to inventory"
          icon={Warehouse}
          tone="green"
        />
      </section>

      <TableShell>
        <Toolbar
          query={query}
          onQueryChange={setQuery}
          placeholder="Search return, receipt, customer, or item"
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-xs">
            <thead>
              <tr className="bg-[var(--surface-subtle)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
                <th className="px-5 py-3 font-semibold">Return</th>
                <th className="px-4 py-3 font-semibold">Original sale</th>
                <th className="px-4 py-3 font-semibold">Item</th>
                <th className="px-4 py-3 font-semibold">Reason</th>
                <th className="px-4 py-3 text-right font-semibold">Value</th>
                <th className="px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((record) => (
                <tr
                  key={record.id}
                  className="border-t border-[var(--border)] hover:bg-[var(--surface-subtle)]"
                >
                  <td className="px-5 py-3.5">
                    <p className="font-semibold">{record.id}</p>
                    <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
                      {formatDate(new Date(record.createdAt))}
                    </p>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-medium">{record.saleId}</p>
                    <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
                      {record.customerName}
                    </p>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-medium">{record.itemName}</p>
                    <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
                      {record.quantity} units
                    </p>
                  </td>
                  <td className="px-4 py-3.5 text-[var(--muted-foreground)]">
                    {record.reason}
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold">
                    {formatCurrency(record.amount)}
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusBadge
                      tone={record.status === "approved" ? "green" : "amber"}
                    >
                      {record.status}
                    </StatusBadge>
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
        title="Process return"
        description="Approved quantities are immediately restored to inventory."
      >
        <form onSubmit={submit}>
          <div className="space-y-4 p-5">
            <FormField label="Original sale">
              <select
                required
                className={inputClass}
                value={form.saleId}
                onChange={(event) => {
                  const sale = state.sales.find(
                    (entry) => entry.id === event.target.value,
                  );
                  setForm({
                    ...form,
                    saleId: event.target.value,
                    productId: sale?.items[0]?.productId ?? "",
                  });
                }}
              >
                {state.sales.map((sale) => (
                  <option key={sale.id} value={sale.id}>
                    {sale.id} · {sale.customerName} ·{" "}
                    {formatCurrency(sale.total)}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Item">
              <select
                required
                className={inputClass}
                value={form.productId}
                onChange={(event) =>
                  setForm({ ...form, productId: event.target.value })
                }
              >
                {selectedSale?.items.map((item) => (
                  <option key={item.productId} value={item.productId}>
                    {item.name} · max {item.quantity}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Quantity">
              <input
                required
                min="1"
                max={
                  selectedSale?.items.find(
                    (item) => item.productId === form.productId,
                  )?.quantity ?? 1
                }
                type="number"
                className={inputClass}
                value={form.quantity}
                onChange={(event) =>
                  setForm({ ...form, quantity: Number(event.target.value) })
                }
              />
            </FormField>
            <FormField label="Reason">
              <textarea
                required
                className={textareaClass}
                value={form.reason}
                onChange={(event) =>
                  setForm({ ...form, reason: event.target.value })
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
            <Button type="submit">Approve return</Button>
          </ModalFooter>
        </form>
      </Modal>
    </Workspace>
  );
}
