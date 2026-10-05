// The styles the titles share (shared/title-styles.ts), held in a single
// place: every title reads its own from here, and a style changed in a drawer
// shows at once on all the titles that use it.
//
// Read once, when the first reader mounts, and again when another tab changes
// them (App's event stream); after a change made here, it is the server's
// response that is authoritative.

import { useEffect, useSyncExternalStore } from "react";
import { api } from "../api";
import { TITLE_STYLE, TITLE_STYLE_KEYS } from "@milo/shared";
import type { TitleStyle } from "@milo/shared";

let styles: TitleStyle[] = [];
let readItems = false;
const subscribers = new Set<() => void>();

const publish = (next: TitleStyle[]) => {
  styles = next;
  for (const subscriber of subscribers) subscriber();
};

const subscribe = (subscriber: () => void) => {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
};

/** Rereads the styles: on the first reader, then when the server says they changed. */
export const loadTitleStyles = async () => {
  publish(await api.getTitleStyles());
};

const read = () => {
  if (readItems) return;
  readItems = true;
  loadTitleStyles().catch(() => {
    // Unread, the titles keep their own appearance.
    readItems = false;
  });
};

export function useTitleStyles(): TitleStyle[] {
  const current = useSyncExternalStore(subscribe, () => styles);
  useEffect(read, []);
  return current;
}

/** Writes the whole list; the display follows the server's response. */
export const saveTitleStyles = async (next: TitleStyle[]) => {
  // Shown right away: a color dragged in the picker must not wait for the server.
  publish(next);
  try {
    publish(await api.updateTitleStyles(next));
  } catch (e) {
    await loadTitleStyles().catch(() => {});
    throw e;
  }
};

/**
 * The style a title uses. None chosen, or deleted since, it is "fallback" —
 * "H1" for a title, which always has one —, or "undefined" without it.
 */
export const styleOf = (config: unknown, fallback?: string): TitleStyle | undefined => {
  const id = (config as Record<string, unknown> | null)?.[TITLE_STYLE];
  const chosen = typeof id === "string" ? styles.find((s) => s.id === id) : undefined;
  return chosen ?? (fallback ? styles.find((s) => s.id === fallback) : undefined);
};

/**
 * A title's configuration as it is displayed: with a style, the style's
 * appearance replaces its own — what it holds otherwise, its text, stays.
 */
export const styledConfig = (config: unknown, fallback?: string): Record<string, unknown> => {
  const own = (config as Record<string, unknown> | null) ?? {};
  const style = styleOf(own, fallback);
  if (!style) return own;
  const rest = Object.fromEntries(
    Object.entries(own).filter(([key]) => !(TITLE_STYLE_KEYS as readonly string[]).includes(key)),
  );
  return { ...rest, ...style.config };
};

/** The appearance of a title, as the configuration of a new style. */
export const appearanceOf = (config: unknown, fallback?: string): Record<string, unknown> => {
  const own = styledConfig(config, fallback);
  return Object.fromEntries(
    TITLE_STYLE_KEYS.filter((key) => own[key] !== undefined && own[key] !== "").map((key) => [
      key,
      own[key],
    ]),
  );
};

/** A new style's identifier: unique enough for a list of a few names. */
export const newStyleId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
