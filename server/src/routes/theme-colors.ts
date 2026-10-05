// The "Thèmes" section of "Paramétrage": the colors of the light and dark
// themes, for the whole application (see shared/theme-colors.ts).

import { Router } from "express";
import { THEME_COLORS, isThemeHex } from "@milo/shared";
import type { ThemeColors } from "@milo/shared";
import { readSetting, writeSetting } from "../repositories/settings.js";

export const themeColorRoutes = Router();

const KEYS = new Set(THEME_COLORS.map((c) => c.key));

/**
 * Only the known colors, and only hexadecimal values: a color removed since,
 * or a value that is not one, is dropped rather than refused.
 */
const cleaned = (raw: unknown): ThemeColors => {
  const result: ThemeColors = {};
  if (!raw || typeof raw !== "object") return result;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!KEYS.has(key) || !value || typeof value !== "object") continue;
    const { light, dark } = value as { light?: unknown; dark?: unknown };
    const color: { light?: string; dark?: string } = {};
    if (isThemeHex(light)) color.light = light.toLowerCase();
    if (isThemeHex(dark)) color.dark = dark.toLowerCase();
    if (color.light || color.dark) result[key] = color;
  }
  return result;
};

const themeColors = (): ThemeColors => cleaned(readSetting("theme_colors", {}));

themeColorRoutes.get("/", (_req, res) => {
  res.json(themeColors());
});

// The whole set of changed colors replaces the stored one.
themeColorRoutes.put("/", (req, res) => {
  writeSetting("theme_colors", cleaned(req.body));
  res.json(themeColors());
});
