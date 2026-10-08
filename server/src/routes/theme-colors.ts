// The themes ("Paramétrage" > "Affichage"): their list and their colors, for
// the whole application (see shared/theme-colors.ts).

import { Router } from "express";
import { saveThemes, themes } from "../lib/theme-colors.js";

export const themeColorRoutes = Router();

themeColorRoutes.get("/", (_req, res) => {
  res.json(themes());
});

// The whole list replaces the stored one.
themeColorRoutes.put("/", (req, res) => {
  saveThemes(req.body);
  res.json(themes());
});
