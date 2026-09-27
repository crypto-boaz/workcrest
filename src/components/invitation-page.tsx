"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { platformApi, secureApiRequest } from "@/lib/platform-api";

type AuthState = "checking" | "anonymous" | "authenticated" | "invalid" | "error";

export function InvitationPage() {
  const [organization, setOrganization] = useState("");
  const [token, setToken] = useState("");
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextOrganization = params.get("organization")?.trim() ?? "";
    const nextToken = params.get("token") ?? "";
    setOrganization(nextOrganization);
    setToken(nextToken);
    if (!nextOrganization || !nextToken) {
      setAuthState("invalid");
      return;
    }
    let active = true;
    void platformApi
      .sessionContext()
      .then((session) => {
        if (active) {
          setAuthState(session.authenticated ? "authenticated" : "anonymous");
        }
      })
      .catch(() => {
        if (active) {
          setError("Could not check your session. Refresh this page.");
          setAuthState("error");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const invitePath = `/auth/invite?organization=${encodeURIComponent(organization)}&token=${encodeURIComponent(token)}`;
  const loginHref = `/auth/login?next=${encodeURIComponent(invitePath)}`;
  const signupHref = `/auth/signup?next=${encodeURIComponent(invitePath)}`;

  async function acceptInvitation() {
    setBusy(true);
    setError("");
    try {
      await secureApiRequest("/api/v1/invitations/accept/", {
        method: "POST",
        body: JSON.stringify({ token, organization_slug: organization }),
      });
      window.location.assign("/dashboard");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The invitation could not be accepted.",
      );
      setBusy(false);
    }
  }

  async function switchAccount() {
    setBusy(true);
    setError("");
    try {
      await platformApi.logout();
      window.location.assign(loginHref);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not sign out. Try again.",
      );
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] p-6">
      <section className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold text-[var(--primary)]">Workcrest</p>
        <h1 className="mt-2 text-2xl font-semibold">Join a workspace</h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          {authState === "invalid"
            ? "This invitation link is incomplete. Ask the sender for a new link."
            : `You have been invited to ${organization || "a company"}. Sign in with the invited email address to join.`}
        </p>
        {error && (
          <p role="alert" className="mt-5 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        {authState === "checking" && (
          <p role="status" className="mt-6 text-sm text-[var(--muted-foreground)]">
            Checking your sign-in session…
          </p>
        )}
        {authState === "error" && (
          <Button className="mt-6 w-full" onClick={() => window.location.reload()}>
            Retry
          </Button>
        )}
        {authState === "anonymous" && (
          <div className="mt-6 space-y-3">
            <Button asChild className="w-full">
              <Link href={loginHref}>Sign in to accept</Link>
            </Button>
            <p className="text-center text-sm text-[var(--muted-foreground)]">
              Need an account?{" "}
              <Link className="text-[var(--primary)]" href={signupHref}>
                Create one
              </Link>
            </p>
          </div>
        )}
        {authState === "authenticated" && (
          <div className="mt-6 space-y-3">
            <Button className="w-full" disabled={busy} onClick={acceptInvitation}>
              {busy ? "Accepting…" : "Accept invitation"}
            </Button>
            <Button
              className="w-full"
              variant="secondary"
              disabled={busy}
              onClick={switchAccount}
            >
              Use a different account
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
