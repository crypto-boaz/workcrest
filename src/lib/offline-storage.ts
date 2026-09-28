import type { ApiProduct, ApiSale } from "@/lib/commerce-api";
import type { TenantBootstrap, TenantManifest } from "@/lib/platform-types";

const DATABASE_NAME = "workcrest-offline-v1";
const STORE = "records";

export interface OfflineIdentity {
  bootstrap: TenantBootstrap;
  manifest: TenantManifest;
  savedAt: string;
}

export interface OfflinePin {
  salt: number[];
  hash: number[];
}

async function pinHash(pin: string, salt: number[]): Promise<number[]> {
  const material = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2", salt: new Uint8Array(salt), iterations: 150_000, hash: "SHA-256",
  }, material, 256);
  return Array.from(new Uint8Array(bits));
}

export interface PendingOfflineSale {
  id: string;
  organizationId: string;
  locationId: string;
  userId: string;
  createdAt: string;
  items: Array<{ product_id: string; quantity: string; expected_unit_price: string }>;
  customerId?: string | null;
  // Optional so cash sales saved by earlier app versions remain readable.
  paymentMethod?: "cash" | "card" | "transfer";
  paymentReference?: string;
  discount: string;
  total: number;
  status: "pending" | "needs_review";
  error?: string;
}

export interface OfflineCatalogue {
  products: ApiProduct[];
  complete: boolean;
  savedAt: string;
}

export interface OfflineSalesSnapshot {
  sales: ApiSale[];
  savedAt: string;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function read<T>(key: string): Promise<T | undefined> {
  const database = await openDatabase();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readonly");
      const request = transaction.objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

async function write(key: string, value?: unknown): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      if (value === undefined) transaction.objectStore(STORE).delete(key);
      else transaction.objectStore(STORE).put(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export const offlineScope = (organizationId: string, locationId: string) =>
  `${organizationId}.${locationId}`;

export const offlineStorage = {
  getIdentity: () => read<OfflineIdentity>("last-identity"),
  saveIdentity: (identity: OfflineIdentity) => write("last-identity", identity),
  clearIdentity: () => write("last-identity"),
  getPin: () => read<OfflinePin>("offline-pin"),
  clearPin: () => write("offline-pin"),
  setPin: async (pin: string) => {
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)));
    await write("offline-pin", { salt, hash: await pinHash(pin, salt) });
  },
  verifyPin: async (pin: string) => {
    const saved = await read<OfflinePin>("offline-pin");
    if (!saved) return false;
    const actual = await pinHash(pin, saved.salt);
    return actual.length === saved.hash.length &&
      actual.every((byte, index) => byte === saved.hash[index]);
  },
  getCatalogue: (scope: string) => read<OfflineCatalogue>(`products:${scope}`),
  saveCatalogue: (scope: string, catalogue: OfflineCatalogue) =>
    write(`products:${scope}`, catalogue),
  getSalesSnapshot: (scope: string, userId: string) =>
    read<OfflineSalesSnapshot>(`sales-history:${scope}:${userId}`),
  rememberSales: async (scope: string, userId: string, sales: ApiSale[]) => {
    if (!sales.length) return;
    const database = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE, "readwrite");
        const store = transaction.objectStore(STORE);
        const key = `sales-history:${scope}:${userId}`;
        const request = store.get(key);
        request.onsuccess = () => {
          const previous = request.result as OfflineSalesSnapshot | undefined;
          const merged = new Map<string, ApiSale>();
          for (const sale of previous?.sales ?? []) merged.set(sale.id, sale);
          for (const sale of sales) merged.set(sale.id, sale);
          store.put({
            sales: [...merged.values()]
              .sort((a, b) => Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? ""))
              .slice(0, 1000),
            savedAt: new Date().toISOString(),
          } satisfies OfflineSalesSnapshot, key);
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  },
  getSales: async (scope: string): Promise<PendingOfflineSale[]> => {
    const database = await openDatabase();
    try {
      return await new Promise<PendingOfflineSale[]>((resolve, reject) => {
        const request = database.transaction(STORE, "readonly")
          .objectStore(STORE)
          .getAll(IDBKeyRange.bound(`sale:${scope}:`, `sale:${scope}:\uffff`));
        request.onsuccess = () => resolve(request.result as PendingOfflineSale[]);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  },
  saveSale: (sale: PendingOfflineSale) =>
    write(`sale:${offlineScope(sale.organizationId, sale.locationId)}:${sale.id}`, sale),
  deleteSale: (scope: string, id: string) => write(`sale:${scope}:${id}`),
};
