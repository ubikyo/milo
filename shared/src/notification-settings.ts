// The notification settings: each person chooses theirs, in the
// "Notifications" tab of their preferences.

/**
 * "immediate": one email per event. "grouped": the events of the same
 * item accumulate for `emailDelayMinutes`, then go out in a single email
 * that summarizes them.
 */
export type NotificationEmailMode = "immediate" | "grouped";

/**
 * What a notification comes from. "production": working in the widgets, the
 * edit mode off — a card, a project, a ticket, a list, a label. "edit": the
 * edit mode — adding, arranging and configuring widgets and sections.
 * "settings": the Paramétrage menu.
 */
export type NotificationScope = "production" | "edit" | "settings";

export const NOTIFICATION_SCOPES: { value: NotificationScope; label: string }[] = [
  { value: "production", label: "Production" },
  { value: "edit", label: "Édition" },
  { value: "settings", label: "Paramétrage" },
];

export const isNotificationScope = (value: unknown): value is NotificationScope =>
  NOTIFICATION_SCOPES.some((s) => s.value === value);

/** Where one's own actions are notified, when one wants them. */
export type OwnActionsChannel = "screen" | "email" | "both";

export interface NotificationSettings {
  /** On-screen notifications — they stay stored in the drawer. */
  toasts: boolean;
  /** Email notifications. */
  email: boolean;
  emailMode: NotificationEmailMode;
  /** The grouping delay, in minutes. */
  emailDelayMinutes: number;
  /**
   * Being notified of one's own actions too, whatever they touch — by
   * default, one is not.
   */
  ownActions: boolean;
  ownActionsChannel: OwnActionsChannel;
  /** The kinds of notifications received; the others are not sent. */
  scopes: NotificationScope[];
}

/** The proposed grouping delays, in minutes. */
export const NOTIFICATION_EMAIL_DELAYS = [1, 5, 10, 15, 30, 60] as const;
