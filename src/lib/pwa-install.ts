export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: InstallPromptEvent | null = null;

export function getInstallPrompt() {
  return deferredPrompt;
}

export function setInstallPrompt(prompt: InstallPromptEvent | null) {
  deferredPrompt = prompt;
  window.dispatchEvent(new Event("workcrest-install-prompt"));
}
