// The "Affichage" section of "Paramétrage": settings that apply to the whole
// application (see shared/display-settings.ts).

import { Router } from "express";
import type { DisplaySettings } from "@milo/shared";
import { readSetting, writeSetting } from "../repositories/settings.js";

export const displaySettingsRoutes = Router();

const displaySettings = (): DisplaySettings => ({
  showGravatars: readSetting("display_show_gravatars", true),
  labThemes: readSetting("lab_themes", false),
  labSubviews: readSetting("lab_subviews", false),
});

displaySettingsRoutes.get("/", (_req, res) => {
  res.json(displaySettings());
});

displaySettingsRoutes.put("/", (req, res) => {
  const body = (req.body ?? {}) as Partial<DisplaySettings>;
  if (body.showGravatars !== undefined)
    writeSetting("display_show_gravatars", Boolean(body.showGravatars));
  if (body.labThemes !== undefined) writeSetting("lab_themes", Boolean(body.labThemes));
  if (body.labSubviews !== undefined) writeSetting("lab_subviews", Boolean(body.labSubviews));
  res.json(displaySettings());
});
