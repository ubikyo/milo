// Milo's address, in the "Administration" section of "Paramétrage" (see
// lib/milo-url.ts).

import { Router } from "express";
import type { MiloSettings } from "@milo/shared";
import { miloSettings, saveMiloUrl } from "../lib/milo-url.js";
import { maintainSubscriptions } from "../lib/support-webhooks.js";

export const miloSettingsRoutes = Router();

miloSettingsRoutes.get("/", (_req, res) => {
  res.json(miloSettings());
});

miloSettingsRoutes.put("/", (req, res) => {
  const body = (req.body ?? {}) as Partial<MiloSettings>;
  if (typeof body.url === "string") {
    saveMiloUrl(body.url);
    // Graph is subscribed to at the new address right away, not at the next
    // maintenance run.
    void maintainSubscriptions().catch((e: unknown) =>
      console.error("Subscriptions after address change:", e),
    );
  }
  res.json(miloSettings());
});
