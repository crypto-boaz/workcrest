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

type SessionContext = {
  authenticated: boolean;
  csrf_token: string;
  user: unknown | null;
};

let csrfTokenCache: string | null = null;
let csrfTokenRequest: Promise<string> | null = null;

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
  if (
    init.body &&
    !(typeof FormData !== "undefined" && init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
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
  if (csrfTokenCache) return csrfTokenCache;
  csrfTokenRequest ??= apiRequest<SessionContext>(
    "/api/v1/session/context/",
  )
    .then((context) => {
      csrfTokenCache = context.csrf_token;
      return context.csrf_token;
    })
    .finally(() => {
      csrfTokenRequest = null;
    });
  return csrfTokenRequest;
}

export async function secureApiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const csrfToken = await getCsrfToken();
  const headers = new Headers(init.headers);
  headers.set("X-CSRFToken", csrfToken);
  try {
    return await apiRequest<T>(path, { ...init, headers });
  } catch (error) {
    if (!(error instanceof PlatformApiError) || error.status !== 403) {
      throw error;
    }
    csrfTokenCache = null;
    const refreshedToken = await getCsrfToken();
    headers.set("X-CSRFToken", refreshedToken);
    return apiRequest<T>(path, { ...init, headers });
  }
}

export const platformApi = {
  sessionContext: () =>
    apiRequest<SessionContext>("/api/v1/session/context/").then((context) => {
      csrfTokenCache = context.csrf_token;
      return context;
    }),
  manifest: () => apiRequest<TenantManifest>("/api/v1/tenant-manifest/"),
  bootstrap: () => apiRequest<TenantBootstrap>("/api/v1/bootstrap/"),
  companySettings: () =>
    apiRequest<CompanySettingsResponse>("/api/v1/company-settings/"),
  updateCompanySettings: (input: CompanySettingsInput) =>
    secureApiRequest<CompanySettingsResponse>("/api/v1/company-settings/", {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  uploadCompanyLogo: (logo: File) => {
    const body = new FormData();
    body.append("logo", logo);
    return secureApiRequest<CompanySettingsResponse>("/api/v1/company-logo/", {
      method: "POST",
      body,
    });
  },
  removeCompanyLogo: () =>
    secureApiRequest<CompanySettingsResponse>("/api/v1/company-logo/", {
      method: "DELETE",
    }),
  login: (email: string, password: string) =>
    secureApiRequest<unknown>("/api/v1/auth/browser/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }).then((result) => {
      csrfTokenCache = null;
      return result;
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
      const result = await secureApiRequest<unknown>(
        "/api/v1/auth/browser/v1/auth/signup",
        {
          method: "POST",
          body: JSON.stringify({ email, password }),
        },
      );
      csrfTokenCache = null;
      return result;
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
      const result = await secureApiRequest<unknown>(
        "/api/v1/auth/browser/v1/auth/email/verify",
        {
          method: "POST",
          body: JSON.stringify({ key }),
        },
      );
      csrfTokenCache = null;
      return result;
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
  logout: async () => {
    try {
      return await secureApiRequest<unknown>(
        "/api/v1/auth/browser/v1/auth/session",
        { method: "DELETE" },
      );
    } catch (error) {
      if (
        error instanceof PlatformApiError &&
        isUnauthenticatedAllauthState(error.payload)
      ) {
        return undefined;
      }
      throw error;
    } finally {
      csrfTokenCache = null;
    }
  },
};
