// Each person's notification settings, chosen in the "Notifications" tab of
// their preferences. A field they never set takes the application's default:
// the value once chosen for everyone in Paramétrage, if there is one.

import type { NotificationSettings } from "@milo/shared";
import { NOTIFICATION_EMAIL_DELAYS, isNotificationScope } from "@milo/shared";
import type { UserRow } from "../db/rows.js";
import { env } from "../env.js";
import { readSetting } from "../repositories/settings.js";

/**
 * The defaults. The grouping delay starts from MILO_NOTIFY_WINDOW_MINUTES.
 * The "notify_*" settings are those of the time when notifications were set
 * for the whole application: whoever has not chosen keeps them.
 */
const defaults = (): NotificationSettings => ({
  toasts: readSetting<boolean>("notify_toasts", true) !== false,
  email: readSetting<boolean>("notify_email", true) !== false,
  emailMode: readSetting<string>("notify_email_mode", "grouped") === "immediate" ? "immediate" : "grouped",
  emailDelayMinutes: readSetting<number>("notify_email_delay", env.notifyWindowMs / 60000),
  ownActions: false,
  ownActionsChannel: "screen",
  // Only what is done in the widgets: editing and Paramétrage are asked for.
  scopes: ["production"],
});

/** Keeps from a request, or from the stored JSON, only the valid fields. */
export const validNotificationSettings = (input: unknown): Partial<NotificationSettings> => {
  if (!input || typeof input !== "object") return {};
  const body = input as Record<string, unknown>;
  const valid: Partial<NotificationSettings> = {};
  if (typeof body.toasts === "boolean") valid.toasts = body.toasts;
  if (typeof body.email === "boolean") valid.email = body.email;
  if (body.emailMode === "immediate" || body.emailMode === "grouped") valid.emailMode = body.emailMode;
  const delay = Number(body.emailDelayMinutes);
  if ((NOTIFICATION_EMAIL_DELAYS as readonly number[]).includes(delay)) valid.emailDelayMinutes = delay;
  if (typeof body.ownActions === "boolean") valid.ownActions = body.ownActions;
  if (body.ownActionsChannel === "screen" || body.ownActionsChannel === "email" || body.ownActionsChannel === "both")
    valid.ownActionsChannel = body.ownActionsChannel;
  // "use" is what "production" was called before: the settings stored then
  // keep it.
  if (Array.isArray(body.scopes))
    valid.scopes = [
      ...new Set(body.scopes.map((s) => (s === "use" ? "production" : s)).filter(isNotificationScope)),
    ];
  return valid;
};

/** What the person chose, completed by the defaults. */
export const notificationSettings = (
  user: Pick<UserRow, "notification_settings">,
): NotificationSettings => {
  let stored: unknown = null;
  try {
    stored = user.notification_settings ? JSON.parse(user.notification_settings) : null;
  } catch {
    // Corrupted JSON: the defaults, rather than an account that can no
    // longer be read.
  }
  return { ...defaults(), ...validNotificationSettings(stored) };
};
