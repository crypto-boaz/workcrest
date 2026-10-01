import { apiRequest, secureApiRequest } from "@/lib/platform-api";

export type JobStatus =
  | "received" | "diagnosing" | "awaiting_approval" | "in_progress"
  | "ready" | "collected" | "cancelled";

export interface JobCard {
  id: string;
  number: string;
  location_name: string;
  customer_name: string;
  customer_phone: string;
  device_name: string;
  serial_number: string;
  reported_issue: string;
  intake_condition: string;
  accessories: string;
  diagnosis: string;
  work_done: string;
  status: JobStatus;
  labour_charge: string;
  parts_charge: string;
  expected_at: string | null;
  received_at: string;
  completed_at: string | null;
  collected_at: string | null;
  archived_at?: string | null;
  amount_paid: string;
  total_charge: string;
  balance_due: string;
  payments: Array<{ id: string; amount: string; method: string; reference: string; received_at: string }>;
  events: Array<{ id: string; status: JobStatus; note: string; created_at: string }>;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface JobCardInput {
  customer_name: string;
  customer_phone: string;
  device_name: string;
  serial_number: string;
  reported_issue: string;
  intake_condition: string;
  accessories: string;
  diagnosis: string;
  work_done: string;
  labour_charge: string;
  parts_charge: string;
  expected_at: string | null;
}

interface JobCardPage {
  results: JobCard[];
  next: string | null;
}

const base = (locationId: string) => `/api/v1/locations/${locationId}/job-cards/`;

export const jobCardsApi = {
  get: (locationId: string, cardId: string, archived = false) =>
    apiRequest<JobCard>(`${base(locationId)}${cardId}/${archived ? "?archived=1" : ""}`),
  list: (locationId: string, search = "", nextUrl?: string, archived = false) => {
    const root = base(locationId);
    if (!nextUrl) return apiRequest<JobCardPage>(`${root}?page_size=100&search=${encodeURIComponent(search)}&archived=${archived ? "1" : "0"}`);
    const next = new URL(nextUrl, "https://workcrest.invalid");
    if (next.pathname !== root) throw new Error("Unexpected job card page address.");
    return apiRequest<JobCardPage>(next.pathname + next.search);
  },
  create: (locationId: string, input: JobCardInput, key: string) =>
    secureApiRequest<JobCard>(base(locationId), {
      method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify(input),
    }),
  update: (locationId: string, card: JobCard, values: Partial<JobCardInput> & { status?: JobStatus; status_note?: string }) =>
    secureApiRequest<JobCard>(`${base(locationId)}${card.id}/`, {
      method: "PATCH", body: JSON.stringify({ ...values, expected_version: card.version }),
    }),
  addPayment: (locationId: string, cardId: string, input: { amount: string; method: string; reference: string }, key: string) =>
    secureApiRequest<JobCard>(`${base(locationId)}${cardId}/payments/`, {
      method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify(input),
    }),
  archive: (locationId: string, cardId: string) =>
    secureApiRequest<void>(`${base(locationId)}${cardId}/`, { method: "DELETE" }),
  restore: (locationId: string, cardId: string) =>
    secureApiRequest<JobCard>(`${base(locationId)}${cardId}/restore/`, { method: "POST" }),
};
