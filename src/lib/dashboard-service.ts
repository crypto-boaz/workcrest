import { mockDashboardData } from "@/lib/mock-data";
import type { DashboardData } from "@/lib/types";

export interface DashboardRequest {
  signal?: AbortSignal;
  delay?: number;
}

export async function getDashboardData({
  signal,
  delay = 450,
}: DashboardRequest = {}): Promise<DashboardData> {
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, delay);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("The request was cancelled.", "AbortError"));
      },
      { once: true },
    );
  });

  return structuredClone(mockDashboardData);
}
