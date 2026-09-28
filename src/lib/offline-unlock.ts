const KEY = "workcrest.offline-unlock.v1";
export const OFFLINE_IDLE_MS = 30 * 60_000;

interface OfflineUnlock {
  scope: string;
  lastActivity: number;
}

export function readOfflineUnlock(scope: string): boolean {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw) as OfflineUnlock;
    if (saved.scope === scope &&
        Number.isFinite(saved.lastActivity) &&
        Date.now() - saved.lastActivity < OFFLINE_IDLE_MS &&
        saved.lastActivity <= Date.now()) return true;
    window.localStorage.removeItem(KEY);
  } catch {
    // A blocked or corrupt browser store cannot extend offline access.
  }
  return false;
}

export function touchOfflineUnlock(scope: string): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({
      scope,
      lastActivity: Date.now(),
    } satisfies OfflineUnlock));
  } catch {
    // The current page stays unlocked; another navigation will ask for the PIN.
  }
}

export function clearOfflineUnlock(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // The expiry check still rejects an old unlock when storage is readable.
  }
}
