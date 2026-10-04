// The "Notifications" section of "Paramétrage": settings that apply to the
// whole application (see shared/notification-settings.ts).

import { Router } from "express";
import type { NotificationSettings } from "@milo/shared";
import { NOTIFICATION_EMAIL_DELAYS } from "@milo/shared";
import { notificationSettings } from "../lib/notify.js";
import { writeSetting } from "../repositories/settings.js";

export const notificationSettingsRoutes = Router();

notificationSettingsRoutes.get("/", (_req, res) => {
  res.json(notificationSettings());
});

notificationSettingsRoutes.put("/", (req, res) => {
  const body = (req.body ?? {}) as Partial<NotificationSettings>;
  if (body.toasts !== undefined) writeSetting("notify_toasts", Boolean(body.toasts));
  if (body.email !== undefined) writeSetting("notify_email", Boolean(body.email));
  if (body.emailMode === "immediate" || body.emailMode === "grouped") {
    writeSetting("notify_email_mode", body.emailMode);
  }
  const delay = Number(body.emailDelayMinutes);
  if ((NOTIFICATION_EMAIL_DELAYS as readonly number[]).includes(delay)) {
    writeSetting("notify_email_delay", delay);
  }
  res.json(notificationSettings());
});
