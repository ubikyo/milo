// The "Thèmes" section of "Paramétrage": the colors of the light and dark
// themes, for the whole application (see shared/theme-colors.ts).

import { Router } from "express";
import { saveThemeColors, themeColors } from "../lib/theme-colors.js";

export const themeColorRoutes = Router();

themeColorRoutes.get("/", (_req, res) => {
  res.json(themeColors());
});

// The whole set of changed colors replaces the stored one.
themeColorRoutes.put("/", (req, res) => {
  saveThemeColors(req.body);
  res.json(themeColors());
});
