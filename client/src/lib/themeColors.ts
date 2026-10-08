// The themes and their colors (the theme editor, "Paramétrage" >
// "Affichage" > "Thèmes"), held in a single place. Each theme is built on
// Mantine's light or dark scheme; the page shows, for each scheme, the theme
// chosen in the profile when it is of that scheme, the system's otherwise.
// Each color becomes a CSS variable, set per scheme in a style element of
// its own: "--milo-<key>", or Mantine's "--mantine-color-<key>" for its own
// colors, and its gray and dark scales for the shades. A color changed in the
// editor shows everywhere at once.
//
// What needs a value rather than a variable — a widget's default color, which
// its picker shows — asks themeColor(), in the current theme.

import { useSyncExternalStore } from "react";
import {
  DEFAULT_THEMES,
  MANTINE_COLOR_KEYS,
  SHADE_KEYS,
  THEME_COLORS,
  THEME_SIDES,
  THEME_SIZES,
  hexaString,
  parseThemeColor,
  themeColorHex,
  themeSizeDefault,
  themeSizeValue,
  themeValueHex,
  systemTheme,
  themePaddingOf,
  writtenThemeColor,
} from "@milo/shared";
import type { Theme, ThemeColors, ThemeScheme } from "@milo/shared";
import { api } from "../api";

export type Scheme = ThemeScheme;

const DEFINITIONS = new Map(THEME_COLORS.map((c) => [c.key, c]));

/** The profile's theme: one of the list, or the system's ("Lié au système"). */
export type ThemeChoice = "system" | number;

const CHOICE_KEY = "milo.theme";
/** "Thème dark", as the installation creates it. */
const DEFAULT_DARK_THEME = DEFAULT_THEMES.find((t) => t.scheme === "dark")!.id;
// Where Mantine remembers its scheme (see main.tsx).
const SCHEME_KEY = "mantine-color-scheme-value";

/**
 * Nothing chosen yet in this browser: the "Thème dark" of the installation,
 * like Mantine's scheme (see main.tsx). Before "Lié au système" was stored,
 * it was the absence of a choice: Mantine's remembered scheme tells it from
 * a first visit.
 */
const readChoice = (): ThemeChoice => {
  try {
    const stored = localStorage.getItem(CHOICE_KEY);
    if (stored === null)
      return localStorage.getItem(SCHEME_KEY) === null ? DEFAULT_DARK_THEME : "system";
    const id = Number(stored);
    return Number.isInteger(id) && id > 0 ? id : "system";
  } catch {
    return DEFAULT_DARK_THEME;
  }
};

interface State {
  themes: Theme[];
  choice: ThemeChoice;
}

// The themes as last read from the server, kept by the browser: they apply
// from the page's first paint, rather than the defaults until the server
// answers — after the sign-in.
const THEMES_KEY = "milo.themes";

const readThemes = (): Theme[] => {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(THEMES_KEY) ?? "null");
    return Array.isArray(stored) &&
      stored.some((t: Partial<Theme>) => t?.scheme === "dark") &&
      stored.some((t: Partial<Theme>) => t?.scheme === "light") &&
      stored.every((t: Partial<Theme>) => typeof t?.id === "number" && t.colors && typeof t.colors === "object")
      ? (stored as Theme[])
      : DEFAULT_THEMES;
  } catch {
    return DEFAULT_THEMES;
  }
};

const keepThemes = (themes: Theme[]) => {
  try {
    localStorage.setItem(THEMES_KEY, JSON.stringify(themes));
  } catch {
    // Not kept: the defaults show again until the server answers.
  }
};

let state: State = { themes: readThemes(), choice: readChoice() };
let read = false;
const subscribers = new Set<() => void>();

const subscribe = (subscriber: () => void) => {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
};

/** The theme the page shows on the scheme: the chosen one if it is of it, the system's otherwise. */
export const themeOf = (scheme: Scheme, { themes, choice } = state): Theme =>
  themes.find((t) => t.id === choice && t.scheme === scheme) ?? systemTheme(themes, scheme);

/**
 * The colors a scheme reads: its theme's, with the scales of both — a shade
 * of the other scheme's scale is that of the other scheme's theme.
 */
const colorsOf = (scheme: Scheme): ThemeColors => {
  const own = themeOf(scheme).colors;
  const light = themeOf("light").colors;
  const dark = themeOf("dark").colors;
  const merged: ThemeColors = { ...own };
  for (const key of SHADE_KEYS) {
    const shade = { light: light[key]?.light, dark: dark[key]?.dark };
    if (shade.light || shade.dark) merged[key] = shade;
    else delete merged[key];
  }
  return merged;
};

/** The color as written: the stored one, otherwise its default. */
export const writtenColor = (key: string, scheme: Scheme): string =>
  writtenThemeColor(colorsOf(scheme), key, scheme);

const SHADE = /^(gray|dark)\.(\d)$/;

/** Another color of the themes, whose value a default takes: "@body". */
const REFERENCE = /^@([a-z0-9-]+)$/;

/** A value in hexadecimal, in the given theme (shared/theme-colors.ts). */
const toHex = (value: string, scheme: Scheme): string => themeValueHex(colorsOf(scheme), value, scheme);

/** A value as #rrggbbaa, the form the Settings show. */
const toHexa = (hex: string): string => {
  const parsed = parseThemeColor(hex);
  return parsed ? hexaString(parsed) : hex;
};

/**
 * A value as CSS: a shade or a reference stays a variable, so that a change
 * of the scale or of that color carries over.
 */
const toCss = (value: string): string => {
  const reference = REFERENCE.exec(value);
  if (reference) return themeVar(reference[1]!);
  if (value === "white" || value === "black") return `var(--mantine-color-${value})`;
  const shade = SHADE.exec(value);
  if (shade) return `var(--mantine-color-${shade[1]}-${shade[2]})`;
  return value;
};

/** The color in hexadecimal, in the given theme. */
export const themeColorOf = (key: string, scheme: Scheme): string =>
  themeColorHex(colorsOf(scheme), key, scheme);

export const currentScheme = (): Scheme =>
  document.documentElement.getAttribute("data-mantine-color-scheme") === "dark" ? "dark" : "light";

/** The color as #rrggbbaa, in the given theme. */
export const themeHexaOf = (key: string, scheme: Scheme): string => toHexa(themeColorOf(key, scheme));

/** The color's default as #rrggbbaa: a shade's is the scale's current value. */
export const defaultHexaOf = (key: string, scheme: Scheme): string =>
  toHexa(toHex(DEFINITIONS.get(key)?.[scheme] ?? "#000000", scheme));

/** A size's value in the given theme: the stored one, otherwise its default. */
export const themeSizeOf = (key: string, scheme: Scheme): number =>
  themeSizeValue(themeOf(scheme).colors, key, scheme);

/** A size's default in the given theme: that of the size it follows is its current value. */
export const themeSizeDefaultOf = (key: string, scheme: Scheme): number =>
  themeSizeDefault(themeOf(scheme).colors, key, scheme);

/**
 * A size as CSS: one that follows another (defaultFrom) and is not set stays
 * that size's variable, like a color's reference.
 */
const sizeCss = (size: (typeof THEME_SIZES)[number], scheme: Scheme): string =>
  size.defaultFrom && themeOf(scheme).colors[size.key]?.sizes?.[scheme] === undefined
    ? `var(--milo-${size.defaultFrom})`
    : `${themeSizeOf(size.key, scheme)}${size.unit}`;

/** The color in hexadecimal, in the current theme. */
export const themeColor = (key: string): string => themeColorOf(key, currentScheme());

/** The color's CSS variable: it follows the theme by itself. */
export const themeVar = (key: string): string =>
  MANTINE_COLOR_KEYS.has(key) ? `var(--mantine-color-${key})` : `var(--milo-${key})`;

/**
 * The side of the active tab that opens on its panel: its background, so that
 * it covers the row's line — the page's when it has none (Mantine's own).
 */
const tabActiveJoint = (scheme: Scheme, bg = "tab-active-bg", page = "var(--mantine-color-body)"): string =>
  parseThemeColor(themeColorOf(bg, scheme))?.a ? themeVar(bg) : page;

/** The paddings, whose variable gives their four sides: "--milo-settings-padding". */
const PADDINGS = [...new Set(THEME_SIZES.filter((s) => s.side).map((s) => themePaddingOf(s.key)))];

/** The sides the paddings have: one left out is 0 in its padding's variable. */
const SIDES = new Set(THEME_SIZES.filter((s) => s.side).map((s) => s.key));

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
      .join("") +
    THEME_SIZES.map((size) => `--milo-${size.key}: ${sizeCss(size, s)};`).join("") +
    PADDINGS.map((p) => `--milo-${p}: ${THEME_SIDES.map((side) => (SIDES.has(`${p}-${side}`) ? `var(--milo-${p}-${side})` : "0px")).join(" ")};`).join("") +
    `--milo-tab-active-joint: ${tabActiveJoint(s)};` +
    // The Settings window's, on its own background (tabs.css).
    `--milo-settings-tab-active-joint: ${tabActiveJoint(s, "settings-tab-active-bg", themeVar("settings-bg"))};`;
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

const publish = (next: State) => {
  if (next.themes !== state.themes) keepThemes(next.themes);
  state = next;
  apply();
  for (const subscriber of subscribers) subscriber();
};

// The kept themes — the defaults on a first visit — apply from the start: the
// variables exist before the server answers, and before the sign-in.
apply();

/** Reads the stored themes, once per session. */
export const loadThemeColors = () => {
  if (read) return;
  read = true;
  api
    .getThemes()
    .then((themes) => publish({ ...state, themes }))
    .catch(() => {
      // Unread, the defaults stay.
      read = false;
    });
};

let pendingSave: ReturnType<typeof setTimeout> | null = null;

const save = (onError: (e: unknown) => void, delay: number) => {
  if (pendingSave) clearTimeout(pendingSave);
  pendingSave = setTimeout(() => {
    pendingSave = null;
    api.updateThemes(state.themes).catch(onError);
  }, delay);
};

/**
 * Changes the colors of the theme the scheme shows: they show at once, and go
 * to the server once the picker settles — dragging its cursor would otherwise
 * send a request per step.
 */
export const updateThemeColors = (scheme: Scheme, next: ThemeColors, onError: (e: unknown) => void) => {
  const edited = themeOf(scheme);
  publish({ ...state, themes: state.themes.map((t) => (t === edited ? { ...t, colors: next } : t)) });
  save(onError, 400);
};

/** Replaces the list — a theme added, renamed, deleted —, saved at once. */
export const updateThemes = (themes: Theme[], onError: (e: unknown) => void) => {
  publish({ ...state, themes });
  save(onError, 0);
};

/**
 * The profile's theme, this browser's — like Mantine's scheme, which the
 * caller sets alongside: the chosen theme's, or the system's.
 */
export const setThemeChoice = (choice: ThemeChoice) => {
  try {
    localStorage.setItem(CHOICE_KEY, String(choice));
  } catch {
    // Not remembered: it still applies until the page is reloaded.
  }
  publish({ ...state, choice });
};

export const themeChoice = (): ThemeChoice => state.choice;

/** The themes and the choice; subscribed, the component redraws on each change. */
export function useThemes(): State {
  return useSyncExternalStore(subscribe, () => state);
}

/** The stored colors of the theme the scheme shows; subscribed, like useThemes. */
export function useThemeColors(scheme: Scheme): ThemeColors {
  return useSyncExternalStore(subscribe, () => themeOf(scheme).colors);
}
