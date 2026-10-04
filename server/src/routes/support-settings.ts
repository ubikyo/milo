// The "Support" section of "Paramétrage": settings that apply to the whole
// application (see shared/support-settings.ts).

import { Router } from "express";
import { SUPPORT_DUE_DAYS_MAX } from "@milo/shared";
import type { SupportSettings } from "@milo/shared";
import { badRequest, toIds } from "../lib/http.js";
import { readSetting, writeSetting } from "../repositories/settings.js";
import { lightestPriority, supportLabels } from "../repositories/support.js";

const DUE_KEY = "support_default_due_days";
const LABELS_KEY = "support_default_label_ids";

/**
 * The automatic labels of an incoming e-mail. Never set: the lightest
 * priority, as before "Paramétrage" offered them. A label deleted since
 * disappears from the setting on its own.
 */
const defaultLabels = (): number[] => {
  const ids = readSetting<number[] | null>(LABELS_KEY, null);
  if (!Array.isArray(ids)) return [lightestPriority().id];
  return toIds(ids).filter((id) => supportLabels.byId.get(id));
};

export const supportSettings = (): SupportSettings => {
  const days = Number(readSetting<number>(DUE_KEY, 0));
  return {
    default_due_days: Number.isInteger(days) && days > 0 ? days : 0,
    default_label_ids: defaultLabels(),
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
  const labels = req.body?.default_label_ids;
  if (labels !== undefined) {
    if (!Array.isArray(labels)) badRequest("Les étiquettes par défaut sont une liste");
    writeSetting(LABELS_KEY, [...new Set(toIds(labels))]);
  }
  res.json(supportSettings());
});
