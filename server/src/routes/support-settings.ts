// La section « Support » du Paramétrage : des réglages qui valent pour toute
// l'application (voir shared/support-settings.ts).

import { Router } from "express";
import { SUPPORT_DUE_DAYS_MAX } from "@milo/shared";
import type { SupportSettings } from "@milo/shared";
import { badRequest, toIds } from "../lib/http.js";
import { readSetting, writeSetting } from "../repositories/settings.js";
import { prioriteLaPlusLegere, supportLabels } from "../repositories/support.js";

const CLE_ECHEANCE = "support_default_due_days";
const CLE_ETIQUETTES = "support_default_label_ids";

/**
 * Les étiquettes d'office d'un e-mail entrant. Jamais réglées : la priorité
 * la plus légère, comme avant que le Paramétrage les propose. Une étiquette
 * supprimée depuis disparaît d'elle-même du réglage.
 */
const etiquettesParDefaut = (): number[] => {
  const ids = readSetting<number[] | null>(CLE_ETIQUETTES, null);
  if (!Array.isArray(ids)) return [prioriteLaPlusLegere().id];
  return toIds(ids).filter((id) => supportLabels.byId.get(id));
};

export const reglagesSupport = (): SupportSettings => {
  const jours = Number(readSetting<number>(CLE_ECHEANCE, 0));
  return {
    default_due_days: Number.isInteger(jours) && jours > 0 ? jours : 0,
    default_label_ids: etiquettesParDefaut(),
  };
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
  const etiquettes = req.body?.default_label_ids;
  if (etiquettes !== undefined) {
    if (!Array.isArray(etiquettes)) badRequest("Les étiquettes par défaut sont une liste");
    writeSetting(CLE_ETIQUETTES, [...new Set(toIds(etiquettes))]);
  }
  res.json(reglagesSupport());
});
