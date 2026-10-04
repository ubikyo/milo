// The "Affichage" section of "Paramétrage": settings that apply to the whole
// application (see shared/display-settings.ts).

import { Router } from "express";
import type { DisplaySettings } from "@milo/shared";
import { readSetting, writeSetting } from "../repositories/settings.js";

export const displaySettingsRoutes = Router();

const displaySettings = (): DisplaySettings => ({
  hideLogo: readSetting("display_hide_logo", false),
});

displaySettingsRoutes.get("/", (_req, res) => {
  res.json(displaySettings());
});

displaySettingsRoutes.put("/", (req, res) => {
  const body = (req.body ?? {}) as Partial<DisplaySettings>;
  if (body.hideLogo !== undefined) writeSetting("display_hide_logo", Boolean(body.hideLogo));
  res.json(displaySettings());
});
