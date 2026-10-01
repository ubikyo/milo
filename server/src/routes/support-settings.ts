// La section « Support » du Paramétrage : des réglages qui valent pour toute
// l'application (voir shared/support-settings.ts).

import { Router } from "express";
import { SUPPORT_DUE_DAYS_MAX } from "@milo/shared";
import type { SupportSettings } from "@milo/shared";
import { badRequest } from "../lib/http.js";
import { readSetting, writeSetting } from "../repositories/settings.js";

const CLE_ECHEANCE = "support_default_due_days";

export const reglagesSupport = (): SupportSettings => {
  const jours = Number(readSetting<number>(CLE_ECHEANCE, 0));
  return { default_due_days: Number.isInteger(jours) && jours > 0 ? jours : 0 };
};

export const supportSettingsRoutes = Router();

supportSettingsRoutes.get("/", (_req, res) => {
  res.json(reglagesSupport());
});

supportSettingsRoutes.put("/", (req, res) => {
  const recu = req.body?.default_due_days;
  if (recu !== undefined) {
    const jours = Number(recu);
    if (!Number.isInteger(jours) || jours < 0 || jours > SUPPORT_DUE_DAYS_MAX) {
      badRequest(`L'échéance par défaut va de 0 à ${SUPPORT_DUE_DAYS_MAX} jours ouvrés`);
    }
    writeSetting(CLE_ECHEANCE, jours);
  }
  res.json(reglagesSupport());
});
