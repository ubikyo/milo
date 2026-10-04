// The "Développeur" section of "Paramétrage": settings that apply to the
// whole application (see shared/developer.ts).

import { Router } from "express";
import type { DeveloperSettings } from "@milo/shared";
import { readSetting, writeSetting } from "../repositories/settings.js";

const settings = (): DeveloperSettings => ({
  debug: readSetting<boolean>("debug", false) === true,
});

export const developerRoutes = Router();

developerRoutes.get("/", (_req, res) => {
  res.json(settings());
});

developerRoutes.put("/", (req, res) => {
  if (req.body?.debug !== undefined) writeSetting("debug", Boolean(req.body.debug));
  res.json(settings());
});
