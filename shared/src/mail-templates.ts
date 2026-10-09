// The templates of the e-mails Milo sends, edited in the "Notifications"
// section of the Settings. Each is written in MJML; the server fills in its
// variables — {{title}}, {{intro}}… — then compiles it into HTML.

// In the order Notifications lists them.
export const MAIL_TEMPLATE_KEYS = [
  "test",
  "new_admin",
  "new_share",
  "linked",
  "changes",
  "reminder",
  "assignment",
  "mailbox_confirmation",
  "support_reply",
  "support_auto_reply",
  "calendar_confirmation",
  "mail_confirmation",
] as const;

export type MailTemplateKey = (typeof MAIL_TEMPLATE_KEYS)[number];

/**
 * The e-mails of the Tickets widget: its inboxes' code, the requests
 * assigned, the replies to the senders.
 */
export const TICKETS_MAIL_TEMPLATE_KEYS: readonly MailTemplateKey[] = [
  "mailbox_confirmation",
  "assignment",
  "support_reply",
  "support_auto_reply",
];

/** The e-mails of the Tâches widget: the reminder before a card's due date. */
export const TASKS_MAIL_TEMPLATE_KEYS: readonly MailTemplateKey[] = ["reminder"];

/**
 * The e-mails of the Tickets, Tâches, Calendar and Mail widgets: their
 * templates are edited from the widget's drawer, not from Notifications.
 */
export const WIDGET_MAIL_TEMPLATE_KEYS: readonly MailTemplateKey[] = [
  ...TICKETS_MAIL_TEMPLATE_KEYS,
  ...TASKS_MAIL_TEMPLATE_KEYS,
  "calendar_confirmation",
  "mail_confirmation",
];

export const isMailTemplateKey = (value: unknown): value is MailTemplateKey =>
  (MAIL_TEMPLATE_KEYS as readonly unknown[]).includes(value);

/** A template variable, what it holds, and the source it is listed under. */
export interface MailTemplateVariable {
  group: string;
  label: string;
  /** As written in the template: "{{title}}". */
  name: string;
}

export interface MailTemplate {
  key: MailTemplateKey;
  /** Its name in the list: "Rappel d'échéance". */
  label: string;
  /** When it is sent. */
  description: string;
  variables: MailTemplateVariable[];
  mjml: string;
  /** Modified in the Settings, rather than the one Milo comes with. */
  custom: boolean;
}

/** The compiled preview, filled with sample data, and what MJML objected to. */
export interface MailTemplatePreview {
  html: string;
  errors: string[];
}
