"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ClipboardPlus, Printer, RefreshCw } from "lucide-react";

import { usePlatform } from "@/components/platform-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, Workspace } from "@/components/workspace/workspace-ui";
import { jobCardsApi, type JobCard, type JobCardInput, type JobStatus } from "@/lib/job-cards-api";
import { offlineScope, offlineStorage } from "@/lib/offline-storage";
import { formatCurrency, formatDate } from "@/lib/utils";

const statuses: Array<{ value: JobStatus; label: string }> = [
  { value: "received", label: "Received" },
  { value: "diagnosing", label: "Diagnosing" },
  { value: "awaiting_approval", label: "Awaiting approval" },
  { value: "in_progress", label: "In progress" },
  { value: "ready", label: "Ready for collection" },
  { value: "collected", label: "Collected" },
  { value: "cancelled", label: "Cancelled" },
];
const statusLabel = (status: JobStatus) => statuses.find((item) => item.value === status)?.label ?? status;
const jobDate = (value: string) => formatDate(new Date(value));
const nextStatuses: Record<JobStatus, JobStatus[]> = {
  received: ["diagnosing", "awaiting_approval", "in_progress", "cancelled"],
  diagnosing: ["awaiting_approval", "in_progress", "cancelled"],
  awaiting_approval: ["in_progress", "cancelled"],
  in_progress: ["ready", "cancelled"],
  ready: ["in_progress", "collected"],
  collected: [], cancelled: [],
};

const emptyForm: JobCardInput = {
  customer_name: "", customer_phone: "", device_name: "", serial_number: "",
  reported_issue: "", intake_condition: "", accessories: "", diagnosis: "",
  work_done: "", labour_charge: "0.00", parts_charge: "0.00", expected_at: null,
};
const inputClass = "w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1 text-xs font-medium"><span>{label}</span>{children}</label>;
}

export function JobCardsPage() {
  const { bootstrap, currentLocation, offline } = usePlatform();
  const scope = offlineScope(bootstrap.organization.id, currentLocation.id);
  const userId = bootstrap.user.id;
  const canManage = Boolean(bootstrap.membership?.is_owner || bootstrap.capabilities.includes("*") || bootstrap.capabilities.includes("sales.create"));
  const [cards, setCards] = useState<JobCard[]>([]);
  const [cardScope, setCardScope] = useState(scope);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<JobCardInput>(emptyForm);
  const [editForm, setEditForm] = useState<JobCardInput>(emptyForm);
  const [status, setStatus] = useState<JobStatus>("received");
  const [statusNote, setStatusNote] = useState("");
  const [payment, setPayment] = useState({ amount: "", method: "cash", reference: "" });
  const pendingCreate = useRef<{ payload: string; key: string } | null>(null);
  const pendingPayment = useRef<{ payload: string; key: string } | null>(null);
  const freshOnlineScope = useRef<string | null>(null);
  const scopedCards = useMemo(() => cardScope === scope ? cards : [], [cardScope, cards, scope]);
  const selected = scopedCards.find((card) => card.id === selectedId) ?? null;

  useEffect(() => {
    let cancelled = false;
    void offlineStorage.getJobCards(scope, userId).then((snapshot) => {
      if (cancelled || (!offline && freshOnlineScope.current === scope)) return;
      setSelectedId(null);
      setCardScope(scope);
      setCards(snapshot?.value ?? []);
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [offline, scope, userId]);

  useEffect(() => {
    if (offline) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void jobCardsApi.list(currentLocation.id, search).then((page) => {
        if (cancelled) return;
        freshOnlineScope.current = scope;
        setCardScope(scope);
        setCards(page.results);
        setNext(page.next);
        setError("");
        if (!search) void offlineStorage.saveJobCards(scope, userId, page.results).catch(() => undefined);
      }).catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load job cards.");
      }).finally(() => { if (!cancelled) setLoading(false); });
    }, search ? 300 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [currentLocation.id, offline, scope, search, userId]);

  useEffect(() => {
    if (!selected) return;
    const timer = window.setTimeout(() => {
      setEditForm({
        customer_name: selected.customer_name, customer_phone: selected.customer_phone,
        device_name: selected.device_name, serial_number: selected.serial_number,
        reported_issue: selected.reported_issue, intake_condition: selected.intake_condition,
        accessories: selected.accessories, diagnosis: selected.diagnosis,
        work_done: selected.work_done, labour_charge: selected.labour_charge,
        parts_charge: selected.parts_charge, expected_at: selected.expected_at,
      });
      setStatus(selected.status);
      setStatusNote("");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selected]);

  const visibleCards = useMemo(() => offline
    ? scopedCards.filter((card) => `${card.number} ${card.customer_name} ${card.customer_phone} ${card.device_name} ${card.serial_number}`.toLowerCase().includes(search.toLowerCase()))
    : scopedCards, [scopedCards, offline, search]);

  const replaceCard = (card: JobCard) => {
    const updated = [card, ...scopedCards.filter((item) => item.id !== card.id)];
    setCardScope(scope);
    setCards(updated);
    void offlineStorage.rememberJobCard(scope, userId, card).catch(() => undefined);
    setSelectedId(card.id);
  };

  async function createCard(event: FormEvent) {
    event.preventDefault();
    if (offline || !canManage) return;
    setBusy(true); setError("");
    try {
      const payload = JSON.stringify(createForm);
      if (pendingCreate.current?.payload !== payload) pendingCreate.current = { payload, key: crypto.randomUUID() };
      const card = await jobCardsApi.create(currentLocation.id, createForm, pendingCreate.current.key);
      pendingCreate.current = null;
      replaceCard(card);
      setCreateForm(emptyForm);
      setShowCreate(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create job card."); }
    finally { setBusy(false); }
  }

  async function saveCard(event: FormEvent) {
    event.preventDefault();
    if (!selected || offline || !canManage) return;
    setBusy(true); setError("");
    try {
      const card = await jobCardsApi.update(currentLocation.id, selected, {
        ...editForm, status, status_note: statusNote,
      });
      replaceCard(card);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save job card. Refresh before retrying."); }
    finally { setBusy(false); }
  }

  async function addPayment(event: FormEvent) {
    event.preventDefault();
    if (!selected || offline || !canManage) return;
    setBusy(true); setError("");
    try {
      const payload = JSON.stringify({ cardId: selected.id, ...payment });
      if (pendingPayment.current?.payload !== payload) pendingPayment.current = { payload, key: crypto.randomUUID() };
      const card = await jobCardsApi.addPayment(currentLocation.id, selected.id, payment, pendingPayment.current.key);
      pendingPayment.current = null;
      replaceCard(card);
      setPayment({ amount: "", method: "cash", reference: "" });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not record payment."); }
    finally { setBusy(false); }
  }

  async function refreshSelected() {
    if (!selected || offline) return;
    setBusy(true); setError("");
    try {
      replaceCard(await jobCardsApi.get(currentLocation.id, selected.id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not refresh this job card."); }
    finally { setBusy(false); }
  }

  if (!bootstrap.organization.job_cards_enabled) {
    return <Workspace size="medium"><PageHeader title="Job cards" description="The company owner can enable repair services in Settings." /></Workspace>;
  }

  return <Workspace>
    <PageHeader eyebrow="Repair services" title="Job cards" description="Track devices from intake to collection and print a customer copy."
      actions={canManage && !offline ? <Button disabled={loading || busy} onClick={() => setShowCreate((value) => !value)}><ClipboardPlus className="size-4" />New job card</Button> : undefined} />
    {offline && <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">Offline: showing job cards saved on this device. Reconnect to create jobs, update progress, or record payments.</p>}
    <p className="text-xs text-[var(--muted-foreground)]">Repair payments are recorded on job cards. They do not yet appear in Sales reports, and parts charges do not deduct product stock.</p>
    {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">{error}</p>}
    {showCreate && !offline && canManage && <Card><CardHeader><CardTitle>Receive a device</CardTitle></CardHeader><CardContent>
      <form onSubmit={(event) => void createCard(event)} className="grid gap-3 sm:grid-cols-2">
        {(["customer_name", "customer_phone", "device_name", "serial_number"] as const).map((key) =>
          <Field key={key} label={key.replaceAll("_", " ")}><input className={inputClass} required={key !== "serial_number"} maxLength={key === "customer_phone" ? 32 : 180} value={createForm[key]} onChange={(event) => setCreateForm({ ...createForm, [key]: event.target.value })} /></Field>)}
        {(["reported_issue", "intake_condition", "accessories"] as const).map((key) =>
          <Field key={key} label={key.replaceAll("_", " ")}><textarea className={inputClass} required={key === "reported_issue"} rows={2} value={createForm[key]} onChange={(event) => setCreateForm({ ...createForm, [key]: event.target.value })} /></Field>)}
        {(["labour_charge", "parts_charge"] as const).map((key) =>
          <Field key={key} label={`${key.replaceAll("_", " ")} (optional)`}><input type="number" min="0" step="0.01" required className={inputClass} value={createForm[key]} onChange={(event) => setCreateForm({ ...createForm, [key]: event.target.value })} /></Field>)}
        <Field label="Expected completion"><input type="date" className={inputClass} value={createForm.expected_at ?? ""} onChange={(event) => setCreateForm({ ...createForm, expected_at: event.target.value || null })} /></Field>
        <div className="sm:col-span-2 flex gap-2"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Create job card"}</Button><Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button></div>
      </form>
    </CardContent></Card>}
    <div className="grid gap-4 lg:grid-cols-[minmax(260px,360px)_1fr]">
      <Card><CardHeader><CardTitle>Repair jobs</CardTitle></CardHeader><CardContent className="space-y-3">
        <input type="search" aria-label="Search job cards" placeholder="Search number, customer, or device" className={inputClass} value={search} onChange={(event) => setSearch(event.target.value)} />
        {loading && <p className="text-sm text-[var(--muted-foreground)]">Loading jobs…</p>}
        {!loading && visibleCards.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">No job cards found.</p>}
        {visibleCards.map((card) => <button key={card.id} type="button" onClick={() => setSelectedId(card.id)} className={`w-full rounded-lg border p-3 text-left text-sm ${selectedId === card.id ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--border)]"}`}>
          <span className="flex justify-between gap-2"><strong>{card.number}</strong><span>{statusLabel(card.status)}</span></span>
          <span className="mt-1 block text-[var(--muted-foreground)]">{card.device_name} · {card.customer_name}</span>
          <span className="mt-1 block text-xs">Balance {formatCurrency(Number(card.balance_due))}</span>
        </button>)}
        {next && !offline && <Button variant="secondary" disabled={busy} onClick={() => {
          setBusy(true);
          void jobCardsApi.list(currentLocation.id, search, next).then((page) => {
            const merged = [...scopedCards, ...page.results.filter((item) => !scopedCards.some((existing) => existing.id === item.id))];
            setCards(merged);
            if (!search) void offlineStorage.saveJobCards(scope, userId, merged).catch(() => undefined);
            setNext(page.next);
          }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load more jobs.")).finally(() => setBusy(false));
        }}>Load more</Button>}
      </CardContent></Card>
      {selected ? <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><div><CardTitle>{selected.number} · {selected.device_name}</CardTitle><p className="mt-1 text-xs text-[var(--muted-foreground)]">{selected.customer_name} · {selected.customer_phone}</p></div><div className="flex gap-2">{!offline && <Button variant="secondary" disabled={busy} onClick={() => void refreshSelected()}><RefreshCw className="size-4" />Refresh</Button>}<Button variant="secondary" onClick={() => window.print()}><Printer className="size-4" />Print card</Button></div></div></CardHeader><CardContent className="space-y-5">
        <div className="grid gap-2 text-sm sm:grid-cols-3"><p>Status: <strong>{statusLabel(selected.status)}</strong></p><p>Received: {jobDate(selected.received_at)}</p><p>Expected: {selected.expected_at ? jobDate(selected.expected_at) : "Not set"}</p></div>
        <p className="whitespace-pre-wrap text-sm"><strong>Reported issue:</strong> {selected.reported_issue}</p>
        {canManage && !offline && <form onSubmit={(event) => void saveCard(event)} className="grid gap-3 border-t border-[var(--border)] pt-4 sm:grid-cols-2">
          <h3 className="text-sm font-semibold sm:col-span-2">Repair details and progress</h3>
          {(["customer_name", "customer_phone", "device_name", "serial_number"] as const).map((key) => <Field key={key} label={key.replaceAll("_", " ")}><input className={inputClass} required={key !== "serial_number"} maxLength={key === "customer_phone" ? 32 : 180} value={editForm[key]} onChange={(event) => setEditForm({ ...editForm, [key]: event.target.value })} /></Field>)}
          <Field label="Reported issue"><textarea required className={inputClass} rows={2} value={editForm.reported_issue} onChange={(event) => setEditForm({ ...editForm, reported_issue: event.target.value })} /></Field>
          {(["diagnosis", "work_done", "intake_condition", "accessories"] as const).map((key) => <Field key={key} label={key.replaceAll("_", " ")}><textarea className={inputClass} rows={2} value={editForm[key]} onChange={(event) => setEditForm({ ...editForm, [key]: event.target.value })} /></Field>)}
          {(["labour_charge", "parts_charge"] as const).map((key) => <Field key={key} label={key.replaceAll("_", " ")}><input type="number" min="0" step="0.01" required className={inputClass} value={editForm[key]} onChange={(event) => setEditForm({ ...editForm, [key]: event.target.value })} /></Field>)}
          <Field label="Expected completion"><input type="date" className={inputClass} value={editForm.expected_at ?? ""} onChange={(event) => setEditForm({ ...editForm, expected_at: event.target.value || null })} /></Field>
          <Field label="Status"><select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value as JobStatus)}><option value={selected.status}>{statusLabel(selected.status)}</option>{nextStatuses[selected.status].map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></Field>
          {status !== selected.status && <Field label="Status note"><input className={inputClass} maxLength={500} value={statusNote} onChange={(event) => setStatusNote(event.target.value)} /></Field>}
          <div className="sm:col-span-2"><Button disabled={busy} type="submit">Save changes</Button></div>
        </form>}
        <div className="grid gap-1 border-t border-[var(--border)] pt-4 text-sm"><p>Labour: {formatCurrency(Number(selected.labour_charge))}</p><p>Parts: {formatCurrency(Number(selected.parts_charge))}</p><p className="font-semibold">Total: {formatCurrency(Number(selected.total_charge))}</p><p>Paid: {formatCurrency(Number(selected.amount_paid))}</p><p className="font-semibold">Balance: {formatCurrency(Number(selected.balance_due))}</p></div>
        {canManage && !offline && Number(selected.balance_due) > 0 && <form onSubmit={(event) => void addPayment(event)} className="grid gap-3 border-t border-[var(--border)] pt-4 sm:grid-cols-3"><h3 className="text-sm font-semibold sm:col-span-3">Record a payment</h3><Field label="Amount"><input type="number" min="0.01" max={selected.balance_due} step="0.01" required className={inputClass} value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} /></Field><Field label="Method"><select className={inputClass} value={payment.method} onChange={(event) => setPayment({ ...payment, method: event.target.value })}><option value="cash">Cash</option><option value="card">Card</option><option value="transfer">Transfer</option></select></Field><Field label="Reference (optional)"><input className={inputClass} maxLength={100} value={payment.reference} onChange={(event) => setPayment({ ...payment, reference: event.target.value })} /></Field><div className="sm:col-span-3"><Button type="submit" disabled={busy}>Record payment</Button></div></form>}
        <div className="grid gap-4 border-t border-[var(--border)] pt-4 sm:grid-cols-2"><div><h3 className="text-sm font-semibold">Status history</h3><ul className="mt-2 space-y-2 text-xs">{selected.events.map((event) => <li key={event.id}>{jobDate(event.created_at)} · {statusLabel(event.status)}{event.note ? ` — ${event.note}` : ""}</li>)}</ul></div><div><h3 className="text-sm font-semibold">Payments</h3><ul className="mt-2 space-y-2 text-xs">{selected.payments.map((item) => <li key={item.id}>{jobDate(item.received_at)} · {formatCurrency(Number(item.amount))} · {item.method}{item.reference ? ` · ${item.reference}` : ""}</li>)}</ul></div></div>
      </CardContent></Card> : <Card><CardContent className="grid min-h-64 place-items-center text-sm text-[var(--muted-foreground)]">Select a job card to see its details.</CardContent></Card>}
    </div>
    {selected && <div id="job-card-print" aria-hidden="true" className="hidden">
      <h1>{bootstrap.branding.display_name}</h1><p>Job Card · {selected.number}</p><hr />
      <p><strong>Branch:</strong> {selected.location_name}</p><p><strong>Received:</strong> {jobDate(selected.received_at)}</p><p><strong>Status:</strong> {statusLabel(selected.status)}</p>
      <hr /><h2>Customer</h2><p>{selected.customer_name} · {selected.customer_phone}</p>
      <h2>Device</h2><p>{selected.device_name}{selected.serial_number ? ` · S/N ${selected.serial_number}` : ""}</p>
      <p><strong>Reported issue:</strong> {selected.reported_issue}</p>
      {selected.intake_condition && <p><strong>Condition at intake:</strong> {selected.intake_condition}</p>}
      {selected.accessories && <p><strong>Accessories received:</strong> {selected.accessories}</p>}
      {selected.work_done && <p><strong>Work done:</strong> {selected.work_done}</p>}
      {selected.expected_at && <p><strong>Expected completion:</strong> {jobDate(selected.expected_at)}</p>}
      <hr /><p>Labour: {formatCurrency(Number(selected.labour_charge))}</p><p>Parts: {formatCurrency(Number(selected.parts_charge))}</p><p><strong>Total: {formatCurrency(Number(selected.total_charge))}</strong></p><p>Paid: {formatCurrency(Number(selected.amount_paid))}</p><p><strong>Balance due: {formatCurrency(Number(selected.balance_due))}</strong></p>
      <hr /><p>Present this card when collecting your device. Keep it as evidence of the work recorded above.</p>
    </div>}
  </Workspace>;
}
