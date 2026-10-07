// The "Affichage" section of "Paramétrage": settings that apply to the whole
// application (see shared/display-settings.ts).

import { Router } from "express";
import { DEFAULT_SEARCH_THRESHOLD } from "@milo/shared";
import type { DisplaySettings } from "@milo/shared";
import { readSetting, writeSetting } from "../repositories/settings.js";

export const displaySettingsRoutes = Router();

const displaySettings = (): DisplaySettings => ({
  showGravatars: readSetting("display_show_gravatars", true),
  fuzzySearch: readSetting("display_fuzzy_search", true),
  searchThreshold: readSetting("display_search_threshold", DEFAULT_SEARCH_THRESHOLD),
});

displaySettingsRoutes.get("/", (_req, res) => {
  res.json(displaySettings());
});

displaySettingsRoutes.put("/", (req, res) => {
  const body = (req.body ?? {}) as Partial<DisplaySettings>;
  if (body.showGravatars !== undefined)
    writeSetting("display_show_gravatars", Boolean(body.showGravatars));
  if (body.fuzzySearch !== undefined)
    writeSetting("display_fuzzy_search", Boolean(body.fuzzySearch));
  // Between 0 and 1, to the hundredth: anything else is ignored.
  const threshold = Number(body.searchThreshold);
  if (body.searchThreshold !== undefined && Number.isFinite(threshold))
    writeSetting("display_search_threshold", Math.round(Math.min(1, Math.max(0, threshold)) * 100) / 100);
  res.json(displaySettings());
});
