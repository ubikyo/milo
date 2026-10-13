import { useEffect, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

// The "N" shortcut — a new project, request, asset… —: declared by each list
// widget shown, not known to the application. A widget registers what it
// creates while it is mounted and may create; the shortcut acts in the one
// under the mouse, otherwise in the first of the page. The shortcuts help
// (ShortcutsHelp) lists what is registered.

interface Registration {
  /** "Nouveau projet": as the shortcuts help says it. */
  action: string;
  run: () => void;
  /** The widget's element: the one under the mouse wins. */
  element: () => HTMLElement | null;
}

let registrations: Registration[] = [];
const listeners = new Set<() => void>();

const changed = () => {
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/**
 * Declares the widget's "N": "action" as the help says it, "run" — none
 * when this person may not create — what it opens. The returned ref goes on
 * the widget's root: it tells which widget is under the mouse.
 */
export function useNewShortcut<T extends HTMLElement = HTMLDivElement>(
  action: string,
  run: (() => void) | undefined,
) {
  const element = useRef<T | null>(null);
  // The latest function, without registering again at each render.
  const latest = useRef(run);
  useEffect(() => {
    latest.current = run;
  });
  const enabled = Boolean(run);
  useEffect(() => {
    if (!enabled) return;
    const registration: Registration = {
      action,
      run: () => latest.current?.(),
      element: () => element.current,
    };
    registrations = [...registrations, registration];
    changed();
    return () => {
      registrations = registrations.filter((r) => r !== registration);
      changed();
    };
  }, [action, enabled]);
  return element;
}

/**
 * The widget's "N", around what it shows: a wrapper without a box of its
 * own, which leaves the layout as it was.
 */
export function NewShortcut({
  action,
  run,
  children,
}: {
  action: string;
  run: (() => void) | undefined;
  children: ReactNode;
}) {
  const element = useNewShortcut(action, run);
  return (
    <div ref={element} style={{ display: "contents" }}>
      {children}
    </div>
  );
}

/** The actions registered, once each, for the shortcuts help. */
export function useNewShortcutActions(): string[] {
  const all = useSyncExternalStore(subscribe, () => registrations);
  return [...new Set(all.map((r) => r.action))];
}

/**
 * "N" pressed: the widget under the mouse creates, otherwise the first of the
 * page. False when none is registered.
 */
export function runNewShortcut(): boolean {
  const shown = registrations
    .map((r) => ({ r, el: r.element() }))
    .filter((x): x is { r: Registration; el: HTMLElement } => x.el !== null && x.el.isConnected);
  if (shown.length === 0) return false;
  const hovered = shown.find((x) => x.el.matches(":hover"));
  const first = [...shown].sort((a, b) =>
    a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  )[0]!;
  (hovered ?? first).r.run();
  return true;
}
