// The "Support" section of "Paramétrage": settings that apply to the whole
// application (see shared/support-settings.ts).

import { Router } from "express";
import {
  SUPPORT_DUE_DAYS_MAX,
  SUPPORT_POLL_MINUTES_DEFAULT,
  SUPPORT_POLL_MINUTES_MAX,
  SUPPORT_POLL_MINUTES_MIN,
} from "@milo/shared";
import type { SupportSettings } from "@milo/shared";
import { badRequest } from "../lib/http.js";
import { readSetting, writeSetting } from "../repositories/settings.js";

// The labels of an incoming e-mail are no longer here: each request list
// chooses them among its board's (shared, NEW_MESSAGE_LABELS).
const DUE_KEY = "support_default_due_days";
const POLL_KEY = "support_mail_poll_minutes";

const isPollMinutes = (minutes: number): boolean =>
  Number.isInteger(minutes) &&
  minutes >= SUPPORT_POLL_MINUTES_MIN &&
  minutes <= SUPPORT_POLL_MINUTES_MAX;

export const supportSettings = (): SupportSettings => {
  const days = Number(readSetting<number>(DUE_KEY, 0));
  const minutes = Number(readSetting<number>(POLL_KEY, SUPPORT_POLL_MINUTES_DEFAULT));
  return {
    default_due_days: Number.isInteger(days) && days > 0 ? days : 0,
    mail_poll_minutes: isPollMinutes(minutes) ? minutes : SUPPORT_POLL_MINUTES_DEFAULT,
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
  const receivedMinutes = req.body?.mail_poll_minutes;
  if (receivedMinutes !== undefined) {
    const minutes = Number(receivedMinutes);
    if (!isPollMinutes(minutes)) {
      badRequest(
        `L'actualisation des e-mails va de ${SUPPORT_POLL_MINUTES_MIN} à ${SUPPORT_POLL_MINUTES_MAX} minutes`,
      );
    }
    writeSetting(POLL_KEY, minutes);
  }
  res.json(supportSettings());
});
