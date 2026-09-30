"use client";

import { Download, HardDriveDownload } from "lucide-react";
import { useEffect, useState } from "react";

import { offlineStorage } from "@/lib/offline-storage";
import { getInstallPrompt, setInstallPrompt, type InstallPromptEvent } from "@/lib/pwa-install";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOfflineWorkspace } from "@/components/offline-workspace-provider";

export function PwaInstallCard() {
  const { products, catalogueComplete } = useOfflineWorkspace();
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(() => getInstallPrompt());
  const [installed, setInstalled] = useState(false);
  const [persistent, setPersistent] = useState<boolean | null>(null);
  const [hasPin, setHasPin] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");

  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const timer = window.setTimeout(() => setInstalled(media.matches), 0);
    const onPrompt = () => setPrompt(getInstallPrompt());
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
      setInstallPrompt(null);
    };
    window.addEventListener("workcrest-install-prompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    void navigator.storage?.persisted?.().then(setPersistent);
    void offlineStorage.getPin().then((saved) => setHasPin(Boolean(saved)));
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("workcrest-install-prompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    setInstallPrompt(null);
  };

  const protectStorage = async () => {
    if (!navigator.storage?.persist) return;
    setPersistent(await navigator.storage.persist());
  };

  const savePin = async () => {
    if (pin.length < 6) {
      setPinError("Use at least 6 characters.");
      return;
    }
    try {
      await offlineStorage.setPin(pin);
      window.dispatchEvent(new Event("workcrest-offline-pin-set"));
      setHasPin(true);
      setPin("");
      setPinError("");
    } catch {
      setPinError("This device could not save the offline PIN.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Install Workcrest</CardTitle>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Open Workcrest from your device like an app. Visit Dashboard, Products, Sales, Point of sale, Job cards (if enabled), Expenses, Reports, Alerts, and Settings while online to prepare those pages for offline use.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs font-medium">
          {catalogueComplete
            ? `${products.length} products saved for offline use at this location.`
            : "Open Point of sale while online to finish saving this location's catalogue."}
        </p>
        {prompt ? (
          <Button type="button" onClick={() => void install()}>
            <Download className="size-4" /> Install app
          </Button>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">
            {installed
              ? "Workcrest is installed on this device."
              : "Use your browser menu and choose Install app or Add to Home Screen if an install button is not shown."}
          </p>
        )}
        {persistent !== true && navigatorStorageAvailable() && (
          <Button type="button" variant="secondary" onClick={() => void protectStorage()}>
            <HardDriveDownload className="size-4" /> Protect offline data
          </Button>
        )}
        {hasPin ? (
          <p className="text-xs text-emerald-700 dark:text-emerald-400">Offline PIN is ready on this device. You will unlock again after 30 minutes without activity.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <input type="password" autoComplete="new-password" value={pin}
              onChange={(event) => setPin(event.target.value)}
              placeholder="Set offline PIN (6+ characters)"
              aria-label="Set offline PIN"
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 text-sm" />
            <Button type="button" variant="secondary" onClick={() => void savePin()}>Enable offline unlock</Button>
            {pinError && <p role="alert" className="w-full text-xs text-red-600">{pinError}</p>}
          </div>
        )}
        <p className="text-xs text-[var(--muted-foreground)]">
          Unsynced sales stay on this device across restarts. Clearing site data or losing the device before sync can erase them.
          {persistent === true ? " Persistent storage is enabled." : ""}
        </p>
      </CardContent>
    </Card>
  );
}

function navigatorStorageAvailable() {
  return typeof navigator !== "undefined" && Boolean(navigator.storage?.persist);
}
