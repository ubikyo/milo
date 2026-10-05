// The styles of the titles (see shared/title-styles.ts): read by everyone,
// written by whoever can modify a title — creating a style, changing it, is
// part of setting titles. The whole list is written at once: it is short, and
// the client keeps it in its order.

import { Router } from "express";
import { BUILT_IN_TITLE_STYLES, isBuiltInTitleStyle, TITLE_STYLE_KEYS, TITLE_STYLE_NAME_MAX } from "@milo/shared";
import type { TitleStyle } from "@milo/shared";
import { badRequest } from "../lib/http.js";
import { requireWidget } from "../lib/rights.js";
import { touch } from "../middleware/events.js";
import { readSetting, writeSetting } from "../repositories/settings.js";

export const titleStyleRoutes = Router();

const KEY = "title_styles";
const KEYS = new Set<string>(TITLE_STYLE_KEYS);

/**
 * The stored styles, "H1" and "H2" first — added when the list lacks them:
 * never saved, or saved without them; a hand-edited value that is not a list
 * reads as none.
 */
const titleStyles = (): TitleStyle[] => {
  const stored = readSetting<unknown>(KEY, []);
  const styles = Array.isArray(stored) ? (stored as TitleStyle[]) : [];
  // The built-in styles first, in their order — "H1", then "H2" —, each as
  // stored if it was, with its base even saved by a version that had none.
  const builtIns = BUILT_IN_TITLE_STYLES.map((b) => {
    const stored = styles.find((s) => s.id === b.id);
    return stored ? { ...stored, base: b.base } : b;
  });
  return [...builtIns, ...styles.filter((s) => !isBuiltInTitleStyle(s.id))];
};

/** A received style, kept to what a style carries — or "null" if unreadable. */
const cleanStyle = (value: unknown): TitleStyle | null => {
  const v = value as Partial<TitleStyle> | null;
  if (typeof v?.id !== "string" || !v.id || typeof v.name !== "string") return null;
  const name = v.name.trim().slice(0, TITLE_STYLE_NAME_MAX);
  if (!name) return null;
  const config =
    v.config && typeof v.config === "object" && !Array.isArray(v.config)
      ? Object.fromEntries(Object.entries(v.config).filter(([key]) => KEYS.has(key)))
      : {};
  return { id: v.id, name, config, ...(typeof v.base === "string" ? { base: v.base } : {}) };
};

titleStyleRoutes.get("/", (_req, res) => {
  res.json(titleStyles());
});

titleStyleRoutes.put("/", touch("title-styles"), (req, res) => {
  requireWidget(req, "category", "update");
  if (!Array.isArray(req.body)) badRequest("Liste de styles attendue");
  const styles = (req.body as unknown[]).map(cleanStyle);
  if (styles.some((s) => s === null)) badRequest("Style illisible");
  writeSetting(KEY, styles);
  res.json(titleStyles());
});
