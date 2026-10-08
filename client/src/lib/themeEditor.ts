// The theme editor's switch ("Paramétrage" > "Affichage"). It is this
// browser's alone: turned on, it lays a panel beside the interface and each
// window, which nobody else should see. Remembered between sessions; when
// the storage is unavailable, it simply starts off.

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "milo.themeEditor";

const readStored = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

let enabled = readStored();
const subscribers = new Set<() => void>();

const subscribe = (subscriber: () => void) => {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
};

export const setThemeEditor = (next: boolean) => {
  enabled = next;
  try {
    if (next) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Not remembered: it still applies until the page is reloaded.
  }
  for (const subscriber of subscribers) subscriber();
};

/** Whether the theme editor is on; subscribed, the component redraws when it flips. */
export function useThemeEditor(): boolean {
  return useSyncExternalStore(subscribe, () => enabled);
}
