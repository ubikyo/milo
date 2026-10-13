// The widgets clipboard: the widget copied by "Copier" (a widget's
// menu), waiting to be pasted into a section — of the same view or of
// another, of another board. It keeps only what is needed to recreate it: its type and
// its configuration; pasting means adding it there, as from the widgets
// drawer.
//
// The widget cut by "Couper" stays in place until it is pasted: pasting
// moves it (server, PUT /board-widgets/:id/move). It stays the same widget,
// its configuration and its content — a list its items, a calendar its
// consents. Cut and never pasted, it is not lost.
//
// Pasted once, it is emptied: the "Coller" items leave the menus, and the
// same widget is not pasted again by mistake.
//
// It lives in the browser (localStorage): it survives view changes
// and reloads, and passes from one tab to another. Refused storage — a
// private window — leaves it in memory only.

import { migrateWidgetConfig } from "@milo/shared";
import type { Id } from "@milo/shared";
import { useSyncExternalStore } from "react";

export interface CopiedWidget {
  type: string;
  config: Record<string, unknown>;
  /** Its name, for "Coller …" in the sections menu. */
  label: string;
  /** The widget cut, by its id: pasting moves it rather than copying it. */
  cut?: Id;
}

const KEY = "milo.clipboard.widget";
/** Its previous key: a widget copied back then can still be pasted. */
const LEGACY_KEY = "milo.presse-papiers.widget";

/**
 * The stored widget, its configuration with today's keys — it may have been
 * copied before they were translated, or by a tab left on the old version.
 */
const read = (): CopiedWidget | null => {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const readValue = JSON.parse(raw) as Partial<CopiedWidget>;
    return typeof readValue.type === "string" && readValue.config && typeof readValue.config === "object"
      ? {
          type: readValue.type,
          config: migrateWidgetConfig(readValue.type, readValue.config),
          label: String(readValue.label ?? readValue.type),
          ...(typeof readValue.cut === "number" && { cut: readValue.cut }),
        }
      : null;
  } catch {
    return null;
  }
};

let current: CopiedWidget | null = read();
const subscribers = new Set<() => void>();
const notify = () => subscribers.forEach((f) => f());

/** Copy a widget: it replaces the previous one. */
export const copyWidget = (copy: CopiedWidget): void => {
  current = copy;
  try {
    localStorage.setItem(KEY, JSON.stringify(copy));
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Storage refused: the copy stays in memory, for the life of the page.
  }
  notify();
};

/** Empty the clipboard, once its widget is pasted. */
export const clearCopiedWidget = (): void => {
  current = null;
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Storage refused: the copy only lived in memory.
  }
  notify();
};

// A copy made in another tab arrives here too.
window.addEventListener("storage", (e) => {
  if (e.key !== KEY) return;
  current = read();
  notify();
});

const subscribe = (f: () => void) => {
  subscribers.add(f);
  return () => subscribers.delete(f);
};

/** The copied widget, or "null". */
export const useCopiedWidget = (): CopiedWidget | null =>
  useSyncExternalStore(subscribe, () => current);
