// Les réglages de la section « Notifications » du Paramétrage. Ils valent pour
// toute l'application, et non pour un compte.

/**
 * « immediate » : un e-mail par fait. « grouped » : les faits d'un même
 * élément s'accumulent pendant `emailDelayMinutes`, puis partent en un e-mail
 * qui les résume.
 */
export type NotificationEmailMode = "immediate" | "grouped";

export interface NotificationSettings {
  /** Les notifications à l'écran — elles restent rangées dans le tiroir. */
  toasts: boolean;
  /** Les notifications par e-mail. */
  email: boolean;
  emailMode: NotificationEmailMode;
  /** Le délai de regroupement, en minutes. */
  emailDelayMinutes: number;
}

/** Les délais de regroupement proposés, en minutes. */
export const NOTIFICATION_EMAIL_DELAYS = [1, 5, 10, 15, 30, 60] as const;
