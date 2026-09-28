"use client";

import { ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { TenantLogo } from "@/components/tenant-logo";
import { WorkcrestLogo } from "@/components/workcrest-logo";
import { mockPlatformManifest } from "@/lib/mock-platform";
import {
  apiMode,
  platformApi,
  PlatformApiError,
  secureApiRequest,
} from "@/lib/platform-api";
import type { TenantManifest } from "@/lib/platform-types";

const inputClass =
  "mt-1.5 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--primary)_20%,transparent)]";

function formatWorkspaceSlug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");
}

function invitationReturnPath() {
  if (typeof window === "undefined") return null;
  const candidate = new URLSearchParams(window.location.search).get("next");
  return candidate?.startsWith("/auth/invite?") ? candidate : null;
}

export function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const [manifest, setManifest] = useState<TenantManifest | null>(() =>
    apiMode ? null : mockPlatformManifest,
  );
  const brandName = manifest?.branding.display_name ?? "Workcrest";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [nextPath, setNextPath] = useState<string | null>(null);

  useEffect(() => {
    setNextPath(invitationReturnPath());
    if (!apiMode) return;
    void platformApi.manifest().then(setManifest).catch(() => undefined);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "signup") {
        await platformApi.signup(email, password);
        setMessage(
          nextPath
            ? "Account created. Verify your email, then return here and sign in to accept the invitation."
            : "Account created. Check your email to verify the address, then sign in.",
        );
        return;
      }
      const session = await platformApi.sessionContext();
      if (!session.authenticated) {
        try {
          await platformApi.login(email, password);
        } catch (loginError) {
          if (
            !(loginError instanceof PlatformApiError) ||
            loginError.status !== 409
          ) {
            throw loginError;
          }
        }
      }
      const returnPath = invitationReturnPath();
      if (returnPath) {
        window.location.assign(returnPath);
        return;
      }
      try {
        await platformApi.bootstrap();
        window.location.assign("/dashboard");
      } catch (bootstrapError) {
        if (
          bootstrapError instanceof PlatformApiError &&
          bootstrapError.status === 403
        ) {
          window.location.assign("/onboarding");
          return;
        }
        throw bootstrapError;
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The request could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-[var(--background)] lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.75fr)]">
      <section className="hidden border-r border-[var(--border)] bg-[var(--sidebar)] p-12 text-white lg:flex lg:flex-col">
        <div className="flex items-center gap-3">
          <TenantLogo
            src={manifest?.branding.logo_url}
            alt={`${brandName} logo`}
            className="size-10 place-items-center rounded-lg"
            fallback={<WorkcrestLogo className="size-10" />}
          />
          <div>
            <p className="font-semibold">{brandName}</p>
            <p className="text-xs text-[var(--sidebar-muted)]">
              Business operations
            </p>
          </div>
        </div>
        <div className="my-auto max-w-lg">
          <p className="text-sm font-medium text-[var(--primary-soft-foreground)]">
            One secure workspace
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight">
            Run the day with the numbers and exceptions that matter.
          </h1>
          <p className="mt-5 text-sm leading-7 text-[var(--sidebar-muted)]">
            Sales, stock, purchasing, staff controls and reports remain isolated
            to your company and active location.
          </p>
        </div>
        <p className="flex items-center gap-2 text-xs text-[var(--sidebar-muted)]">
          <LockKeyhole className="size-4" />
          Secure session authentication · Tenant-isolated data
        </p>
      </section>

      <section className="grid place-items-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2.5">
            <TenantLogo
              src={manifest?.branding.logo_url}
              alt={`${brandName} logo`}
              className="size-7 place-items-center rounded-md"
              fallback={<WorkcrestLogo className="size-7 rounded-md" />}
            />
            <p className="text-sm font-semibold text-[var(--primary)]">{brandName}</p>
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            {mode === "login"
              ? "Sign in to continue to your company workspace."
              : nextPath
                ? "Create an account with the invited email address. You can join the workspace after verification."
                : "Start with your account. Company setup follows after verification."}
          </p>

          <form className="mt-8 space-y-4" onSubmit={submit}>
            <label className="block text-sm font-medium">
              Email address
              <input
                className={inputClass}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="block text-sm font-medium">
              Password
              <input
                className={inputClass}
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
            {message && (
              <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
                {message}
              </p>
            )}
            <Button className="h-11 w-full" disabled={busy}>
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <ArrowRight className="size-4" />
              )}
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-[var(--muted-foreground)]">
            {mode === "login" ? "New to the platform?" : "Already registered?"}{" "}
            <Link
              className="font-semibold text-[var(--primary)] hover:underline"
              href={
                `${mode === "login" ? "/auth/signup" : "/auth/login"}${
                  nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""
                }`
              }
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

export function OnboardingPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [authState, setAuthState] = useState<
    "checking" | "authenticated" | "anonymous"
  >(apiMode ? "checking" : "authenticated");

  useEffect(() => {
    if (!apiMode) return;
    let active = true;
    void platformApi
      .sessionContext()
      .then((session) => {
        if (active) {
          setAuthState(session.authenticated ? "authenticated" : "anonymous");
        }
      })
      .catch(() => {
        if (active) setAuthState("anonymous");
      });
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authState !== "authenticated") {
      setError("Please sign in before creating your company workspace.");
      return;
    }
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await secureApiRequest<{
        organization: { slug: string };
        tenant_domain: string;
        workspace_url: string;
        single_host_tenancy: boolean;
      }>("/api/v1/onboarding/", {
        method: "POST",
        body: JSON.stringify({
          owner_name: form.get("owner_name"),
          organization_name: form.get("organization_name"),
          legal_name: form.get("legal_name"),
          slug: form.get("slug"),
          industry_code: form.get("industry_code"),
          location_name: form.get("location_name"),
          location_kind: form.get("location_kind"),
        }),
      });
      const localHost = ["localhost", "127.0.0.1"].includes(
        window.location.hostname,
      );
      window.location.assign(
        localHost
          ? "/dashboard"
          : result.workspace_url,
      );
    } catch (requestError) {
      setError(
        requestError instanceof PlatformApiError &&
          [401, 403].includes(requestError.status)
          ? "Please sign in before creating your company workspace."
          : requestError instanceof Error
          ? requestError.message
          : "Company setup could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] p-6">
      <section className="w-full max-w-xl rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-2.5">
          <WorkcrestLogo className="size-7 rounded-md" />
          <p className="text-sm font-semibold text-[var(--primary)]">Company setup</p>
        </div>
        <h1 className="mt-2 text-2xl font-semibold">Create your workspace</h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          {authState === "anonymous"
            ? "Sign in with your verified account to finish creating your company."
            : "This creates a 14-day trial, your primary location and your Owner role."}
        </p>
        {authState === "checking" && (
          <div
            role="status"
            className="mt-7 flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-4 text-sm text-[var(--muted-foreground)]"
          >
            <LoaderCircle className="size-4 animate-spin" />
            Checking your sign-in session…
          </div>
        )}
        {authState === "anonymous" && (
          <Button asChild className="mt-7 h-11 w-full">
            <Link href="/auth/login">Sign in to continue</Link>
          </Button>
        )}
        {authState === "authenticated" && (
        <form className="mt-7 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          <label className="block text-sm font-medium">
            Company name
            <input
              name="organization_name"
              type="text"
              required
              className={inputClass}
              value={organizationName}
              onChange={(event) => {
                const nextName = event.target.value;
                setOrganizationName(nextName);
                if (!slugEdited) setSlug(formatWorkspaceSlug(nextName));
              }}
            />
          </label>
          <label className="block text-sm font-medium">
            Workspace address
            <input
              name="slug"
              type="text"
              required
              minLength={3}
              maxLength={63}
              pattern="[a-z][a-z0-9-]{2,62}"
              title="Use 3-63 lowercase letters, numbers, or hyphens, starting with a letter."
              className={inputClass}
              value={slug}
              onChange={(event) => {
                setSlugEdited(true);
                setSlug(formatWorkspaceSlug(event.target.value));
              }}
              aria-describedby="workspace-address-help"
            />
            <span
              id="workspace-address-help"
              className="mt-1.5 block text-xs font-normal text-[var(--muted-foreground)]"
            >
              Your permanent company URL. Use at least 3 characters.
            </span>
          </label>
          {[
            ["owner_name", "Your full name", "text"],
            ["legal_name", "Legal name (optional)", "text"],
            ["location_name", "Primary location", "text"],
          ].map(([name, label, type]) => (
            <label key={name} className="block text-sm font-medium">
              {label}
              <input
                name={name}
                type={type}
                required={name !== "legal_name"}
                className={inputClass}
              />
            </label>
          ))}
          <label className="block text-sm font-medium">
            Industry
            <select name="industry_code" className={inputClass} defaultValue="commerce">
              <option value="commerce">Retail / Commerce</option>
              <option value="beauty-cosmetics">Beauty & Cosmetics</option>
              <option value="fashion">Fashion & Clothing</option>
              <option value="agriculture">Agriculture</option>
              <option value="technology">Technology / Services</option>
              <option value="academic">Education</option>
            </select>
          </label>
          <label className="block text-sm font-medium">
            Location type
            <select name="location_kind" className={inputClass} defaultValue="store">
              <option value="store">Store</option>
              <option value="branch">Branch</option>
              <option value="office">Office</option>
              <option value="warehouse">Warehouse</option>
              <option value="farm">Farm</option>
              <option value="campus">Campus</option>
            </select>
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-600 sm:col-span-2">
              {error}
            </p>
          )}
          <Button className="mt-2 h-11 sm:col-span-2" disabled={busy}>
            {busy && <LoaderCircle className="size-4 animate-spin" />}
            Create workspace
          </Button>
        </form>
        )}
      </section>
    </main>
  );
}
