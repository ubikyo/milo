// The "Support" section of "Paramétrage": settings that apply to the whole
// application (see shared/support-settings.ts).

import { Router } from "express";
import { SUPPORT_DUE_DAYS_MAX } from "@milo/shared";
import type { SupportSettings } from "@milo/shared";
import { badRequest } from "../lib/http.js";
import { readSetting, writeSetting } from "../repositories/settings.js";

// The labels of an incoming e-mail are no longer here: each request list
// chooses them among its board's (shared, NEW_MESSAGE_LABELS).
const DUE_KEY = "support_default_due_days";

export const supportSettings = (): SupportSettings => {
  const days = Number(readSetting<number>(DUE_KEY, 0));
  return {
    default_due_days: Number.isInteger(days) && days > 0 ? days : 0,
  };
};

export const supportSettingsRoutes = Router();

supportSettingsRoutes.get("/", (_req, res) => {
  res.json(supportSettings());
});

supportSettingsRoutes.put("/", (req, res) => {
  const received = req.body?.default_due_days;
  if (received !== undefined) {
    const days = Number(received);
    if (!Number.isInteger(days) || days < 0 || days > SUPPORT_DUE_DAYS_MAX) {
      badRequest(`L'échéance par défaut va de 0 à ${SUPPORT_DUE_DAYS_MAX} jours ouvrés`);
    }
    writeSetting(DUE_KEY, days);
  }
  res.json(supportSettings());
});
