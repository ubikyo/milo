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
  "order_quote_request",
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
 * The e-mails of the Commandes widget: one template for every e-mail to its
 * supplier — a quote asked for, a message written in its "Échanges".
 */
export const ORDERS_MAIL_TEMPLATE_KEYS = ["order_quote_request"] as const;

/**
 * What an order's e-mail is: its first, a quote asked for, or a message —
 * both laid out in the same template. The kind names it in its subject and
 * its thread.
 */
export const ORDER_MAIL_KINDS = ["order_quote_request", "order_message"] as const;

export type OrderMailKind = (typeof ORDER_MAIL_KINDS)[number];

export const isOrderMailKind = (value: unknown): value is OrderMailKind =>
  (ORDER_MAIL_KINDS as readonly unknown[]).includes(value);

/**
 * The e-mails of the Tickets, Tâches, Calendar, Mail and Commandes widgets: their
 * templates are edited from the widget's drawer, not from Notifications.
 */
export const WIDGET_MAIL_TEMPLATE_KEYS: readonly MailTemplateKey[] = [
  ...TICKETS_MAIL_TEMPLATE_KEYS,
  ...TASKS_MAIL_TEMPLATE_KEYS,
  "calendar_confirmation",
  "mail_confirmation",
  ...ORDERS_MAIL_TEMPLATE_KEYS,
];

/**
 * The templates a written message is laid out in — a support reply, an
 * order's e-mail to its supplier: their default contents preview in them.
 */
export const REPLY_TEMPLATE_KEYS = ["support_reply", "support_auto_reply", ...ORDERS_MAIL_TEMPLATE_KEYS] as const;

export type ReplyTemplateKey = (typeof REPLY_TEMPLATE_KEYS)[number];

export const isReplyTemplateKey = (key: unknown): key is ReplyTemplateKey =>
  (REPLY_TEMPLATE_KEYS as readonly unknown[]).includes(key);

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
