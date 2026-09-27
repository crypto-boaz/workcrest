"use client";

import {
  BadgeCheck,
  Banknote,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  Plus,
  ReceiptText,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  WalletCards,
} from "lucide-react";
import { FormEvent, useState } from "react";

import { useBusinessStore } from "@/components/business-store-provider";
import { usePlatform } from "@/components/platform-provider";
import { Button } from "@/components/ui/button";
import type {
  ExpenseInput,
  StaffInput,
  StaffRole,
} from "@/lib/business-types";
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
  textareaClass,
  Toolbar,
  Workspace,
} from "@/components/workspace/workspace-ui";

export function StaffPage() {
  const { state, addStaff, toggleStaffStatus } = useBusinessStore();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [form, setForm] = useState<StaffInput>({
    email: "",
    role: "Cashier",
  });

  const filtered = state.staff.filter(
    (member) =>
      [member.name, member.email, member.role]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (role === "all" || member.role === role),
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await addStaff(form);
      if (result.created) {
        setForm({ email: "", role: "Cashier" });
        if (result.inviteUrl) setInviteUrl(result.inviteUrl);
        else setModalOpen(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const updateRole = (value: StaffRole) =>
    setForm({ ...form, role: value });

  const copyInviteLink = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setLinkCopied(true);
    } catch {
      setLinkCopied(false);
    }
  };

  return (
    <Workspace>
      <PageHeader
        eyebrow="Access control"
        title="Staff"
        description="Invite team members and assign roles to control access."
        actions={
          <Button
            onClick={() => {
              setInviteUrl(null);
              setLinkCopied(false);
              setModalOpen(true);
            }}
          >
            <UserPlus className="size-4" /> Invite staff
          </Button>
        }
      />
      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile
          label="Team members"
          value={String(state.staff.length)}
          detail="Across all roles"
          icon={Users}
        />
        <StatTile
          label="Active now"
          value={String(
            state.staff.filter((member) => member.status === "active").length,
          )}
          detail="With current access"
          icon={UserCheck}
          tone="green"
        />
        <StatTile
          label="Pending invites"
          value={String(
            state.staff.filter((member) => member.status === "invited").length,
          )}
          detail="Awaiting account setup"
          icon={Clock3}
          tone="amber"
        />
        <StatTile
          label="Defined roles"
          value="4"
          detail="Owner, manager, cashier, inventory"
          icon={ShieldCheck}
          tone="blue"
        />
      </section>

      <TableShell>
        <Toolbar
          query={query}
          onQueryChange={setQuery}
          placeholder="Search staff, email, or role"
        >
          <Select
            value={role}
            onChange={setRole}
            ariaLabel="Filter staff by role"
          >
            <option value="all">All roles</option>
            <option value="Owner">Owner</option>
            <option value="Manager">Manager</option>
            <option value="Cashier">Cashier</option>
            <option value="Inventory">Inventory</option>
          </Select>
        </Toolbar>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-xs">
            <thead>
              <tr className="bg-[var(--surface-subtle)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
                <th className="px-5 py-3 font-semibold">Staff member</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Permissions</th>
                <th className="px-4 py-3 font-semibold">Last active</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 text-right font-semibold">Access</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((member) => (
                <tr
                  key={member.id}
                  className="border-t border-[var(--border)] hover:bg-[var(--surface-subtle)]"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 place-items-center rounded-full bg-[var(--primary-soft)] text-xs font-bold text-[var(--primary-soft-foreground)]">
                        {member.name
                          .split(" ")
                          .map((part) => part[0])
                          .slice(0, 2)
                          .join("")}
                      </span>
                      <div>
                        <p className="font-semibold">{member.name}</p>
                        <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
                          {member.email}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                      <BadgeCheck className="size-3.5 text-[var(--primary-soft-foreground)]" />
                      {member.role}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-[var(--muted-foreground)]">
                    {member.permissions.includes("all")
                      ? "Full access"
                      : member.permissions.length
                        ? `${member.permissions.length} permissions`
                        : "Assigned by role"}
                  </td>
                  <td className="px-4 py-3.5 text-[var(--muted-foreground)]">
                    {member.status === "invited"
                      ? "Not yet"
                      : `${formatDate(new Date(member.lastActive))} · ${formatTime(member.lastActive)}`}
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge
                      tone={
                        member.status === "active"
                          ? "green"
                          : member.status === "invited"
                            ? "amber"
                            : "red"
                      }
                    >
                      {member.status}
                    </StatusBadge>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={
                        member.role === "Owner" || member.status === "invited"
                      }
                      onClick={() => toggleStaffStatus(member.id)}
                    >
                      {member.status === "suspended" ? "Restore" : "Suspend"}
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
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) {
            setInviteUrl(null);
            setLinkCopied(false);
          }
        }}
        title={inviteUrl ? "Share invitation" : "Invite staff member"}
        description={
          inviteUrl
            ? "Send this link to the email address you invited."
            : "Choose a role to set this person’s access."
        }
        size="lg"
      >
        {inviteUrl ? (
          <div>
            <div className="space-y-3 p-5">
              <label className="block text-xs font-semibold">
                Invitation link
                <input
                  className={`${inputClass} mt-2`}
                  readOnly
                  value={inviteUrl}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
              <p className="text-xs text-[var(--muted-foreground)]">
                The link expires after three days and works only for the invited
                email address.
              </p>
            </div>
            <ModalFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setModalOpen(false)}
              >
                Done
              </Button>
              <Button type="button" onClick={copyInviteLink}>
                {linkCopied ? "Copied" : "Copy link"}
              </Button>
            </ModalFooter>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="grid gap-4 p-5">
              <FormField label="Email">
                <input
                  required
                  type="email"
                  className={inputClass}
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                  placeholder="name@company.com"
                />
              </FormField>
              <FormField label="Role">
                <select
                  className={inputClass}
                  value={form.role}
                  onChange={(event) =>
                    updateRole(event.target.value as StaffRole)
                  }
                >
                  <option value="Manager">Manager</option>
                  <option value="Cashier">Cashier</option>
                  <option value="Inventory">Inventory</option>
                </select>
              </FormField>
              <p className="text-xs text-[var(--muted-foreground)]">
                Permissions are set by the selected role.
              </p>
            </div>
            <ModalFooter>
              <Button
                type="button"
                variant="secondary"
                disabled={submitting}
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating…" : "Create invitation"}
              </Button>
            </ModalFooter>
          </form>
        )}
      </Modal>
    </Workspace>
  );
}

const todayInput = () => new Date().toISOString().slice(0, 10);

export function ExpensesPage() {
  const { state, addExpense } = useBusinessStore();
  const { bootstrap } = usePlatform();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ExpenseInput>({
    title: "",
    category: "Utilities",
    amount: 0,
    date: todayInput(),
    paymentMethod: "Transfer",
    status: "paid",
    notes: "",
  });

  const categories = Array.from(
    new Set(state.expenses.map((expense) => expense.category)),
  );
  const filtered = state.expenses.filter(
    (expense) =>
      [expense.title, expense.category, expense.notes]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (category === "all" || expense.category === category),
  );
  const total = state.expenses.reduce(
    (sum, expense) => sum + expense.amount,
    0,
  );
  const pending = state.expenses
    .filter((expense) => expense.status === "pending")
    .reduce((sum, expense) => sum + expense.amount, 0);
  const largest = [...state.expenses].sort((a, b) => b.amount - a.amount)[0];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    addExpense({ ...form, date: new Date(form.date).toISOString() });
    setForm({
      title: "",
      category: "Utilities",
      amount: 0,
      date: todayInput(),
      paymentMethod: "Transfer",
      status: "paid",
      notes: "",
    });
    setModalOpen(false);
  };

  const exportExpenses = () =>
    downloadCsv(`${bootstrap.organization.slug}-expenses.csv`, [
      ["Date", "Expense", "Category", "Method", "Status", "Amount"],
      ...filtered.map((expense) => [
        expense.date,
        expense.title,
        expense.category,
        expense.paymentMethod,
        expense.status,
        expense.amount,
      ]),
    ]);

  return (
    <Workspace>
      <PageHeader
        eyebrow="Cash outflow"
        title="Expenses"
        description="Record operating costs, track pending payments, and keep reporting data complete."
        actions={
          <>
            <ExportButton onClick={exportExpenses} />
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="size-4" /> Record expense
            </Button>
          </>
        }
      />
      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile
          label="Total expenses"
          value={formatCurrency(total)}
          detail="Current demo period"
          icon={WalletCards}
          tone="red"
        />
        <StatTile
          label="Paid expenses"
          value={formatCurrency(total - pending)}
          detail="Settled operating costs"
          icon={Banknote}
          tone="green"
        />
        <StatTile
          label="Pending"
          value={formatCurrency(pending)}
          detail="Still awaiting payment"
          icon={CalendarClock}
          tone="amber"
        />
        <StatTile
          label="Largest expense"
          value={formatCurrency(largest?.amount ?? 0)}
          detail={largest?.title ?? "No expense"}
          icon={CircleDollarSign}
        />
      </section>

      <TableShell>
        <Toolbar
          query={query}
          onQueryChange={setQuery}
          placeholder="Search expense, category, or note"
        >
          <Select
            value={category}
            onChange={setCategory}
            ariaLabel="Filter expenses by category"
          >
            <option value="all">All categories</option>
            {categories.map((item) => (
              <option value={item} key={item}>
                {item}
              </option>
            ))}
          </Select>
        </Toolbar>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-xs">
            <thead>
              <tr className="bg-[var(--surface-subtle)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
                <th className="px-5 py-3 font-semibold">Expense</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Payment</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((expense) => (
                <tr
                  key={expense.id}
                  className="border-t border-[var(--border)] hover:bg-[var(--surface-subtle)]"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 place-items-center rounded-lg bg-[var(--surface-subtle)] text-[var(--muted-foreground)]">
                        <ReceiptText className="size-4" />
                      </span>
                      <div>
                        <p className="font-semibold">{expense.title}</p>
                        {expense.notes && (
                          <p className="mt-0.5 max-w-72 truncate text-[10px] text-[var(--muted-foreground)]">
                            {expense.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-[var(--muted-foreground)]">
                    {expense.category}
                  </td>
                  <td className="px-4 py-3.5 text-[var(--muted-foreground)]">
                    {formatDate(new Date(expense.date))}
                  </td>
                  <td className="px-4 py-3.5">{expense.paymentMethod}</td>
                  <td className="px-4 py-3.5">
                    <StatusBadge
                      tone={expense.status === "paid" ? "green" : "amber"}
                    >
                      {expense.status}
                    </StatusBadge>
                  </td>
                  <td className="px-5 py-3.5 text-right font-bold">
                    {formatCurrency(expense.amount)}
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
        title="Record expense"
        description="This expense will immediately appear in financial reports."
      >
        <form onSubmit={submit}>
          <div className="space-y-4 p-5">
            <FormField label="Expense title">
              <input
                required
                className={inputClass}
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
                placeholder="e.g. Generator diesel"
              />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Category">
                <select
                  className={inputClass}
                  value={form.category}
                  onChange={(event) =>
                    setForm({ ...form, category: event.target.value })
                  }
                >
                  <option>Utilities</option>
                  <option>Rent</option>
                  <option>Logistics</option>
                  <option>Staff welfare</option>
                  <option>Marketing</option>
                  <option>Maintenance</option>
                  <option>Other</option>
                </select>
              </FormField>
              <FormField label="Amount (₦)">
                <input
                  required
                  min="1"
                  type="number"
                  className={inputClass}
                  value={form.amount || ""}
                  onChange={(event) =>
                    setForm({ ...form, amount: Number(event.target.value) })
                  }
                />
              </FormField>
              <FormField label="Date">
                <input
                  required
                  type="date"
                  className={inputClass}
                  value={form.date.slice(0, 10)}
                  onChange={(event) =>
                    setForm({ ...form, date: event.target.value })
                  }
                />
              </FormField>
              <FormField label="Payment method">
                <select
                  className={inputClass}
                  value={form.paymentMethod}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      paymentMethod: event.target
                        .value as ExpenseInput["paymentMethod"],
                    })
                  }
                >
                  <option>Cash</option>
                  <option>Card</option>
                  <option>Transfer</option>
                </select>
              </FormField>
              <FormField label="Status" className="sm:col-span-2">
                <select
                  className={inputClass}
                  value={form.status}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      status: event.target.value as ExpenseInput["status"],
                    })
                  }
                >
                  <option value="paid">Paid</option>
                  <option value="pending">Pending</option>
                </select>
              </FormField>
            </div>
            <FormField label="Notes">
              <textarea
                className={textareaClass}
                value={form.notes}
                onChange={(event) =>
                  setForm({ ...form, notes: event.target.value })
                }
                placeholder="Optional reference or context"
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
            <Button type="submit">Save expense</Button>
          </ModalFooter>
        </form>
      </Modal>
    </Workspace>
  );
}
