// Milo's address, in the "Administration" section of "Paramétrage" (see
// lib/milo-url.ts).

import { Router } from "express";
import type { MiloSettings } from "@milo/shared";
import { miloSettings, saveMiloUrl } from "../lib/milo-url.js";

export const miloSettingsRoutes = Router();

miloSettingsRoutes.get("/", (_req, res) => {
  res.json(miloSettings());
});

miloSettingsRoutes.put("/", (req, res) => {
  const body = (req.body ?? {}) as Partial<MiloSettings>;
  if (typeof body.url === "string") saveMiloUrl(body.url);
  res.json(miloSettings());
});
