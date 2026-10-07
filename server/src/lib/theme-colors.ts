// The colors of the light and dark themes, as stored (see
// shared/theme-colors.ts): the "Thèmes" section of "Paramétrage" writes them,
// the e-mail templates read them.

import { THEME_COLORS, THEME_SIZES, cleanThemeSize, hexaString, parseThemeColor } from "@milo/shared";
import type { ThemeColors } from "@milo/shared";
import { readSetting, writeSetting } from "../repositories/settings.js";

const KEYS = new Set(THEME_COLORS.map((c) => c.key));
const SIZES = new Map(THEME_SIZES.map((s) => [s.key, s]));

/**
 * Only the known colors, and only color values, stored as #rrggbbaa: a color
 * removed since, or a value that is not one, is dropped rather than refused.
 * A size is brought within its bounds.
 */
const cleaned = (raw: unknown): ThemeColors => {
  const result: ThemeColors = {};
  if (!raw || typeof raw !== "object") return result;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const size = SIZES.get(key);
    if (size) {
      const raw = value && typeof value === "object" ? (value as { sizes?: unknown }).sizes : null;
      const sizes: { light?: number; dark?: number } = {};
      for (const scheme of ["light", "dark"] as const) {
        const v = raw && typeof raw === "object" ? cleanThemeSize(size, (raw as Record<string, unknown>)[scheme]) : null;
        if (v !== null && v !== size.defaultValue) sizes[scheme] = v;
      }
      if (sizes.light !== undefined || sizes.dark !== undefined) result[key] = { sizes };
      continue;
    }
    if (!KEYS.has(key) || !value || typeof value !== "object") continue;
    const { light, dark } = value as { light?: unknown; dark?: unknown };
    const color: { light?: string; dark?: string } = {};
    const hexa = (v: unknown) => {
      const parsed = typeof v === "string" ? parseThemeColor(v) : null;
      return parsed ? hexaString(parsed) : undefined;
    };
    const lightColor = hexa(light);
    const darkColor = hexa(dark);
    if (lightColor) color.light = lightColor;
    if (darkColor) color.dark = darkColor;
    if (color.light || color.dark) result[key] = color;
  }
  return result;
};

export const themeColors = (): ThemeColors => cleaned(readSetting("theme_colors", {}));

/** The whole set of changed colors replaces the stored one. */
export const saveThemeColors = (raw: unknown): void => writeSetting("theme_colors", cleaned(raw));
