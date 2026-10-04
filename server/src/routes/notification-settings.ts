// La section « Notifications » du Paramétrage : des réglages qui valent pour
// toute l'application (voir shared/notification-settings.ts).

import { Router } from "express";
import type { NotificationSettings } from "@milo/shared";
import { NOTIFICATION_EMAIL_DELAYS } from "@milo/shared";
import { reglagesNotifications } from "../lib/notify.js";
import { writeSetting } from "../repositories/settings.js";

export const notificationSettingsRoutes = Router();

notificationSettingsRoutes.get("/", (_req, res) => {
  res.json(reglagesNotifications());
});

notificationSettingsRoutes.put("/", (req, res) => {
  const corps = (req.body ?? {}) as Partial<NotificationSettings>;
  if (corps.toasts !== undefined) writeSetting("notify_toasts", Boolean(corps.toasts));
  if (corps.email !== undefined) writeSetting("notify_email", Boolean(corps.email));
  if (corps.emailMode === "immediate" || corps.emailMode === "grouped") {
    writeSetting("notify_email_mode", corps.emailMode);
  }
  const delai = Number(corps.emailDelayMinutes);
  if ((NOTIFICATION_EMAIL_DELAYS as readonly number[]).includes(delai)) {
    writeSetting("notify_email_delay", delai);
  }
  res.json(reglagesNotifications());
});
