"use client";

import { CheckCircle2, LoaderCircle, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { mockManifest } from "@/lib/mock-platform";
import { apiMode, platformApi, PlatformApiError } from "@/lib/platform-api";
import type { TenantManifest } from "@/lib/platform-types";

type VerificationState = "checking" | "verified" | "failed";

export default function VerifyEmailPage() {
  const params = useParams<{ key: string }>();
  const started = useRef(false);
  const [manifest, setManifest] = useState<TenantManifest>(mockManifest);
  const [state, setState] = useState<VerificationState>("checking");
  const [message, setMessage] = useState("Confirming your email address…");

  useEffect(() => {
    if (!apiMode) return;
    void platformApi.manifest().then(setManifest).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const rawKey = Array.isArray(params.key) ? params.key[0] : params.key;
    const key = decodeURIComponent(rawKey ?? "");

    if (!key) {
      queueMicrotask(() => {
        setState("failed");
        setMessage("This verification link is missing its confirmation key.");
      });
      return;
    }

    async function verify() {
      try {
        await platformApi.verifyEmail(key);
        setState("verified");
        setMessage("Email verified. Taking you to sign in…");

        window.setTimeout(async () => {
          try {
            const session = await platformApi.sessionContext();
            if (!session.authenticated) {
              window.location.assign("/auth/login");
              return;
            }
            try {
              await platformApi.bootstrap();
              window.location.assign("/dashboard");
            } catch (error) {
              if (error instanceof PlatformApiError && error.status === 403) {
                window.location.assign("/onboarding");
                return;
              }
              window.location.assign("/auth/login");
            }
          } catch {
            window.location.assign("/auth/login");
          }
        }, 900);
      } catch (error) {
        setState("failed");
        setMessage(
          error instanceof Error
            ? error.message
            : "This verification link is invalid or has expired.",
        );
      }
    }

    void verify();
  }, [params.key]);

  const Icon =
    state === "checking"
      ? LoaderCircle
      : state === "verified"
        ? CheckCircle2
        : XCircle;

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] p-6">
      <section className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center shadow-sm">
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary-soft-foreground)]">
          <Icon
            className={state === "checking" ? "size-6 animate-spin" : "size-6"}
          />
        </span>
        <p className="mt-5 text-sm font-semibold text-[var(--primary)]">
          {manifest.branding.display_name}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {state === "verified"
            ? "Email verified"
            : state === "failed"
              ? "Verification failed"
              : "Verifying email"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
          {message}
        </p>
        {state === "failed" && (
          <Button asChild className="mt-6 w-full">
            <Link href="/auth/login">Back to sign in</Link>
          </Button>
        )}
      </section>
    </main>
  );
}
