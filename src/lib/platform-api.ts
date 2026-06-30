import type {
  ApiErrorPayload,
  CompanySettingsInput,
  CompanySettingsResponse,
  TenantBootstrap,
  TenantManifest,
} from "@/lib/platform-types";

export const apiMode =
  process.env.NODE_ENV !== "test" &&
  process.env.NEXT_PUBLIC_DATA_MODE !== "mock";

export function isEmailVerificationPending(payload: ApiErrorPayload) {
  return Boolean(
    payload.data?.flows?.some(
      (flow) => flow.id === "verify_email" && flow.is_pending,
    ),
  );
}

function isUnauthenticatedAllauthState(payload: ApiErrorPayload) {
  return Boolean(
    payload.status === 401 &&
      !payload.errors?.length &&
      payload.data?.flows?.some((flow) => flow.id === "login"),
  );
}

function getFieldErrorMessage(payload: ApiErrorPayload) {
  const entry = Object.entries(payload.field_errors ?? {}).find(
    ([, value]) => Boolean(Array.isArray(value) ? value[0] : value),
  );
  if (!entry) return undefined;

  const [field, value] = entry;
  const message = Array.isArray(value) ? value[0] : value;
  const label = field
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
  return `${label}: ${message}`;
}

export class PlatformApiError extends Error {
  status: number;
  payload: ApiErrorPayload;

  constructor(status: number, payload: ApiErrorPayload) {
    const errorMessage = payload.errors
      ?.map((error) => error.message)
      .filter(Boolean)
      .join(" ");
    const fieldErrorMessage = getFieldErrorMessage(payload);
    super(
      (isEmailVerificationPending(payload)
        ? "Please verify your email address before signing in."
        : undefined) ??
        fieldErrorMessage ??
        payload.message ??
        payload.detail ??
        errorMessage ??
        (status === 429
          ? "Too many attempts. Wait a minute and try again."
          : "The request could not be completed."),
    );
    this.name = "PlatformApiError";
    this.status = status;
    this.payload = payload;
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as
    | T
    | ApiErrorPayload;
  if (!response.ok) {
    throw new PlatformApiError(response.status, payload as ApiErrorPayload);
  }
  return payload as T;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });
  return parseResponse<T>(response);
}

export async function getCsrfToken(): Promise<string> {
  const context = await apiRequest<{ csrf_token: string }>(
    "/api/v1/session/context/",
  );
  return context.csrf_token;
}

export async function secureApiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const csrfToken = await getCsrfToken();
  const headers = new Headers(init.headers);
  headers.set("X-CSRFToken", csrfToken);
  return apiRequest<T>(path, { ...init, headers });
}

export const platformApi = {
  sessionContext: () =>
    apiRequest<{
      authenticated: boolean;
      csrf_token: string;
      user: unknown | null;
    }>("/api/v1/session/context/"),
  manifest: () => apiRequest<TenantManifest>("/api/v1/tenant-manifest/"),
  bootstrap: () => apiRequest<TenantBootstrap>("/api/v1/bootstrap/"),
  companySettings: () =>
    apiRequest<CompanySettingsResponse>("/api/v1/company-settings/"),
  updateCompanySettings: (input: CompanySettingsInput) =>
    secureApiRequest<CompanySettingsResponse>("/api/v1/company-settings/", {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  login: (email: string, password: string) =>
    secureApiRequest<unknown>("/api/v1/auth/browser/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  reauthenticate: (password: string) =>
    secureApiRequest<unknown>(
      "/api/v1/auth/browser/v1/auth/reauthenticate",
      {
        method: "POST",
        body: JSON.stringify({ password }),
      },
    ),
  signup: async (email: string, password: string) => {
    try {
      return await secureApiRequest<unknown>(
        "/api/v1/auth/browser/v1/auth/signup",
        {
          method: "POST",
          body: JSON.stringify({ email, password }),
        },
      );
    } catch (error) {
      if (
        error instanceof PlatformApiError &&
        isEmailVerificationPending(error.payload)
      ) {
        return undefined;
      }
      throw error;
    }
  },
  verifyEmail: async (key: string) => {
    try {
      return await secureApiRequest<unknown>(
        "/api/v1/auth/browser/v1/auth/email/verify",
        {
          method: "POST",
          body: JSON.stringify({ key }),
        },
      );
    } catch (error) {
      if (
        error instanceof PlatformApiError &&
        isUnauthenticatedAllauthState(error.payload)
      ) {
        return undefined;
      }
      throw error;
    }
  },
  logout: () =>
    secureApiRequest<unknown>("/api/v1/auth/browser/v1/auth/session", {
      method: "DELETE",
    }),
};
