// The themes and their colors, as stored (see shared/theme-colors.ts): the
// theme editor and the "Thèmes" list of "Paramétrage" > "Affichage" write
// them, the e-mail templates read the system's light theme.

import {
  DEFAULT_THEMES,
  THEME_COLORS,
  THEME_SIZES,
  cleanThemeSize,
  hexaString,
  parseThemeColor,
  parseThemeWindowKey,
} from "@milo/shared";
import type { Theme, ThemeColors, ThemeScheme } from "@milo/shared";
import { readSetting, writeSetting } from "../repositories/settings.js";

const KEYS = new Set(THEME_COLORS.map((c) => c.key));
const SIZES = new Map(THEME_SIZES.map((s) => [s.key, s]));

/**
 * Only the known colors, and only color values, stored as #rrggbbaa: a color
 * removed since, or a value that is not one, is dropped rather than refused.
 * A size is brought within its bounds. A window's own value of a style
 * ("settings-bg@profile") is cleaned the same way, and kept even empty: the
 * window then follows the style's value.
 */
const cleaned = (raw: unknown): ThemeColors => {
  const result: ThemeColors = {};
  if (!raw || typeof raw !== "object") return result;
  for (const [storedKey, value] of Object.entries(raw as Record<string, unknown>)) {
    const own = parseThemeWindowKey(storedKey);
    const key = own ? own.key : storedKey;
    const entry = cleanedEntry(key, value, own !== null);
    // A window following the style's value rather than its own by default.
    if (entry && own && value && typeof value === "object" && (value as { inherit?: unknown }).inherit === true)
      entry.inherit = true;
    if (entry && (own || Object.keys(entry).length > 0)) result[storedKey] = entry;
  }
  return result;
};

/** One style's stored values; undefined for an unknown style. A window's own keeps any value. */
const cleanedEntry = (key: string, value: unknown, own: boolean): ThemeColors[string] | undefined => {
  const size = SIZES.get(key);
  if (size) {
    const raw = value && typeof value === "object" ? (value as { sizes?: unknown }).sizes : null;
    const sizes: { light?: number; dark?: number } = {};
    for (const scheme of ["light", "dark"] as const) {
      const v = raw && typeof raw === "object" ? cleanThemeSize(size, (raw as Record<string, unknown>)[scheme]) : null;
      // A size that follows another one (defaultFrom) keeps any value: its
      // default is that size's, which the client compares against.
      if (v !== null && (own || size.defaultFrom || v !== size.defaultValue)) sizes[scheme] = v;
    }
    return sizes.light !== undefined || sizes.dark !== undefined ? { sizes } : {};
  }
  if (!KEYS.has(key)) return undefined;
  const { light, dark } = value && typeof value === "object" ? (value as { light?: unknown; dark?: unknown }) : {};
  const color: { light?: string; dark?: string } = {};
  const hexa = (v: unknown) => {
    const parsed = typeof v === "string" ? parseThemeColor(v) : null;
    return parsed ? hexaString(parsed) : undefined;
  };
  const lightColor = hexa(light);
  const darkColor = hexa(dark);
  if (lightColor) color.light = lightColor;
  if (darkColor) color.dark = darkColor;
  return color;
};

const NAME_MAX = 60;

/**
 * A valid list: known schemes, a name, unique ids, and exactly one theme of
 * each scheme for the system — the first one of it when none or several
 * claim it. A scheme left without a theme gets its original back.
 */
const cleanedThemes = (raw: unknown): Theme[] => {
  const themes: Theme[] = [];
  const ids = new Set<number>();
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!item || typeof item !== "object") continue;
    const { id, name, scheme, system, colors } = item as Record<string, unknown>;
    if (typeof id !== "number" || !Number.isInteger(id) || id < 1 || ids.has(id)) continue;
    if (scheme !== "light" && scheme !== "dark") continue;
    const trimmed = typeof name === "string" ? name.trim().slice(0, NAME_MAX) : "";
    if (!trimmed) continue;
    ids.add(id);
    themes.push({ id, name: trimmed, scheme, system: system === true, colors: cleaned(colors) });
  }
  for (const scheme of ["dark", "light"] as ThemeScheme[]) {
    const own = themes.filter((t) => t.scheme === scheme);
    if (own.length === 0) {
      const original = DEFAULT_THEMES.find((t) => t.scheme === scheme)!;
      const id = Math.max(0, ...themes.map((t) => t.id)) + 1;
      themes.push({ ...original, id: ids.has(original.id) ? id : original.id });
      continue;
    }
    const chosen = own.find((t) => t.system) ?? own[0]!;
    for (const t of own) t.system = t === chosen;
  }
  return themes;
};

/**
 * The themes. Before the list existed, the colors of the original pair were
 * stored alone: they become those of the two original themes.
 */
export const themes = (): Theme[] => {
  const stored = readSetting<unknown>("themes", null);
  if (stored !== null) return cleanedThemes(stored);
  const colors = cleaned(readSetting("theme_colors", {}));
  return DEFAULT_THEMES.map((t) => ({ ...t, colors }));
};

/** The whole list replaces the stored one. */
export const saveThemes = (raw: unknown): void => writeSetting("themes", cleanedThemes(raw));
