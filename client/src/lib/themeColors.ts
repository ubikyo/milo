// The colors of the light and dark themes ("Paramétrage" > "Thèmes"), held in
// a single place. Each one becomes a CSS variable, set per theme in a style
// element of its own: "--milo-<key>", or Mantine's "--mantine-color-<key>"
// for its own colors, and its gray and dark scales for the shades. A color
// changed in the Settings shows everywhere at once.
//
// What needs a value rather than a variable — a widget's default color, which
// its picker shows — asks themeColor(), in the current theme.

import { useSyncExternalStore } from "react";
import { MANTINE_COLOR_KEYS, SHADE_KEYS, THEME_COLORS } from "@milo/shared";
import type { ThemeColors } from "@milo/shared";
import { api } from "../api";

export type Scheme = "light" | "dark";

const DEFINITIONS = new Map(THEME_COLORS.map((c) => [c.key, c]));

let colors: ThemeColors = {};
let read = false;
const subscribers = new Set<() => void>();

const subscribe = (subscriber: () => void) => {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
};

/** The color as written: the stored one, otherwise its default. */
export const writtenColor = (key: string, scheme: Scheme): string =>
  colors[key]?.[scheme] ?? DEFINITIONS.get(key)?.[scheme] ?? "#000000";

const SHADE = /^(gray|dark)\.(\d)$/;

/** A value in hexadecimal: a shade is that of the scale, in its own theme. */
const toHex = (value: string): string => {
  if (value === "white") return "#ffffff";
  if (value === "black") return "#000000";
  const shade = SHADE.exec(value);
  if (shade) return themeColorOf(`shade-${shade[2]}`, shade[1] === "gray" ? "light" : "dark");
  return value.toLowerCase();
};

/** A value as CSS: a shade stays a variable, so that a change of the scale carries over. */
const toCss = (value: string): string => {
  if (value === "white" || value === "black") return `var(--mantine-color-${value})`;
  const shade = SHADE.exec(value);
  if (shade) return `var(--mantine-color-${shade[1]}-${shade[2]})`;
  return value;
};

/** The color in hexadecimal, in the given theme. */
export const themeColorOf = (key: string, scheme: Scheme): string => toHex(writtenColor(key, scheme));

export const currentScheme = (): Scheme =>
  document.documentElement.getAttribute("data-mantine-color-scheme") === "dark" ? "dark" : "light";

/** The color in hexadecimal, in the current theme. */
export const themeColor = (key: string): string => themeColorOf(key, currentScheme());

/** The color's CSS variable: it follows the theme by itself. */
export const themeVar = (key: string): string =>
  MANTINE_COLOR_KEYS.has(key) ? `var(--mantine-color-${key})` : `var(--milo-${key})`;

/**
 * The style sheet. Its selectors repeat ":root" to win over Mantine's own,
 * whatever their order in the page.
 */
const styleSheet = (): string => {
  const scale = SHADE_KEYS.map(
    (key, i) =>
      `--mantine-color-gray-${i}: ${themeColorOf(key, "light")};` +
      `--mantine-color-dark-${i}: ${themeColorOf(key, "dark")};`,
  ).join("");
  const scheme = (s: Scheme) =>
    THEME_COLORS.filter((c) => c.group !== "scale")
      .map((c) => {
        const name = MANTINE_COLOR_KEYS.has(c.key) ? `--mantine-color-${c.key}` : `--milo-${c.key}`;
        return `${name}: ${toCss(writtenColor(c.key, s))};`;
      })
      .join("");
  return (
    `:root:root:root{${scale}}` +
    `:root:root[data-mantine-color-scheme="light"]{${scheme("light")}}` +
    `:root:root[data-mantine-color-scheme="dark"]{${scheme("dark")}}`
  );
};

const STYLE_ID = "milo-theme-colors";

const apply = () => {
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = styleSheet();
};

const publish = (next: ThemeColors) => {
  colors = next;
  apply();
  for (const subscriber of subscribers) subscriber();
};

// The defaults apply from the start: the variables exist before the server
// answers, and before the sign-in.
apply();

/** Reads the stored colors, once per session. */
export const loadThemeColors = () => {
  if (read) return;
  read = true;
  api
    .getThemeColors()
    .then(publish)
    .catch(() => {
      // Unread, the defaults stay.
      read = false;
    });
};

let pendingSave: ReturnType<typeof setTimeout> | null = null;

/**
 * Changes the colors: they show at once, and go to the server once the
 * picker settles — dragging its cursor would otherwise send a request per
 * step.
 */
export const updateThemeColors = (next: ThemeColors, onError: (e: unknown) => void) => {
  publish(next);
  if (pendingSave) clearTimeout(pendingSave);
  pendingSave = setTimeout(() => {
    pendingSave = null;
    api.updateThemeColors(colors).catch(onError);
  }, 400);
};

/** The stored colors; subscribed, the component redraws on each change. */
export function useThemeColors(): ThemeColors {
  return useSyncExternalStore(subscribe, () => colors);
}
