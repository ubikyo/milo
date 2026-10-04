// Settings of the "Notifications" section of the Settings. They apply to
// the whole application, not to an account.

/**
 * "immediate": one email per event. "grouped": the events of the same
 * item accumulate for `emailDelayMinutes`, then go out in a single email
 * that summarizes them.
 */
export type NotificationEmailMode = "immediate" | "grouped";

export interface NotificationSettings {
  /** On-screen notifications — they stay stored in the drawer. */
  toasts: boolean;
  /** Email notifications. */
  email: boolean;
  emailMode: NotificationEmailMode;
  /** The grouping delay, in minutes. */
  emailDelayMinutes: number;
}

/** The proposed grouping delays, in minutes. */
export const NOTIFICATION_EMAIL_DELAYS = [1, 5, 10, 15, 30, 60] as const;
