// Settings of the "Support" section of the Settings, and the computation of
// business days that uses them. They apply to the whole application.

import { supportStatusLabel, supportTicketRef } from "./domain.js";
import type { Id, SupportStatus } from "./domain.js";

/**
 * What automatically sends a default reply to the sender of a request
 * received by email. Arrival and follow-up come from the support mailbox;
 * the others follow the request status.
 */
export const SUPPORT_REPLY_EVENTS = [
  { value: "new", label: "Nouvelle demande" },
  { value: "reopened", label: "Demande réouverte" },
  { value: "open", label: "Demande prise en charge" },
  { value: "pending", label: "Demande en attente" },
  { value: "resolved", label: "Demande résolue" },
  { value: "closed", label: "Demande fermée" },
] as const;

export type SupportReplyEvent = (typeof SUPPORT_REPLY_EVENTS)[number]["value"];

export const isSupportReplyEvent = (value: unknown): value is SupportReplyEvent =>
  SUPPORT_REPLY_EVENTS.some((e) => e.value === value);

export const supportReplyEventLabel = (event: string): string =>
  SUPPORT_REPLY_EVENTS.find((e) => e.value === event)?.label ?? "";

/**
 * When a default content is placed in the editor of a team reply.
 * "Tout message" goes in every reply; the others follow the request
 * thread. Those placed go together in the list's order:
 * - "Nouveau message": the thread is empty, the team writes the first one;
 * - "Première réponse": the sender has written, the team has not yet;
 * - "Réponse suivante": the team has already replied.
 */
export const SUPPORT_CONTENT_EVENTS = [
  { value: "all", label: "Tout message" },
  { value: "new", label: "Nouveau message" },
  { value: "first_reply", label: "Première réponse" },
  { value: "reply", label: "Réponse suivante" },
] as const;

export type SupportContentEvent = (typeof SUPPORT_CONTENT_EVENTS)[number]["value"];

export const isSupportContentEvent = (value: unknown): value is SupportContentEvent =>
  SUPPORT_CONTENT_EVENTS.some((e) => e.value === value);

/**
 * A Support default content: a title, its HTML template, and
 * the event that places it in the reply editor.
 */
export interface SupportContent {
  id: Id;
  name: string;
  html: string;
  /** "null": it is placed nowhere. */
  event: SupportContentEvent | null;
}

/** Where a variable comes from: the writing account, the sender, the request. */
export const SUPPORT_VARIABLE_GROUPS = ["Utilisateur", "Demandeur", "Ticket"] as const;

export type SupportVariableGroup = (typeof SUPPORT_VARIABLE_GROUPS)[number];

/**
 * What a template can cite: "{{ticket.number}}" becomes "HLP-12" in
 * the message. The user ("user") is the signed-in account, the requester
 * ("requester") the request's sender: their records come from Entra.
 * Templates stored before cited these variables in French
 * ("{{demande.numero}}"), then the requester as "{{sender.email}}": the
 * migrations rewrote them (migrateSupportTemplate).
 */
export const SUPPORT_REPLY_VARIABLES = [
  { group: "Utilisateur", key: "user.first_name", label: "Prénom" },
  { group: "Utilisateur", key: "user.last_name", label: "Nom" },
  { group: "Utilisateur", key: "user.full_name", label: "Nom complet" },
  { group: "Utilisateur", key: "user.email", label: "Adresse e-mail" },
  { group: "Utilisateur", key: "user.phone", label: "Téléphone professionnel" },
  { group: "Utilisateur", key: "user.mobile", label: "Téléphone mobile" },
  { group: "Utilisateur", key: "user.job_title", label: "Poste" },
  { group: "Utilisateur", key: "user.department", label: "Département" },
  { group: "Utilisateur", key: "user.company", label: "Nom de l'entreprise" },
  { group: "Utilisateur", key: "user.street_address", label: "Adresse postale" },
  { group: "Utilisateur", key: "user.city", label: "Ville" },
  { group: "Utilisateur", key: "user.state", label: "Département (adresse)" },
  { group: "Utilisateur", key: "user.postal_code", label: "Code postal" },
  { group: "Utilisateur", key: "user.country", label: "Pays" },
  { group: "Demandeur", key: "requester.first_name", label: "Prénom" },
  { group: "Demandeur", key: "requester.last_name", label: "Nom" },
  { group: "Demandeur", key: "requester.full_name", label: "Nom complet" },
  { group: "Demandeur", key: "requester.email", label: "Adresse e-mail" },
  { group: "Ticket", key: "ticket.number", label: "Numéro" },
  { group: "Ticket", key: "ticket.subject", label: "Objet" },
  { group: "Ticket", key: "ticket.status", label: "Statut" },
] as const satisfies readonly {
  group: SupportVariableGroup;
  key: string;
  label: string;
}[];

/** The groups and fields of the former variables, mapped to today's. */
const LEGACY_VARIABLE_GROUPS: Record<string, string> = {
  utilisateur: "user",
  expediteur: "requester",
  demande: "ticket",
  // Then named in English, before the "Demandeur": "{{sender.email}}".
  sender: "requester",
};
const LEGACY_VARIABLE_FIELDS: Record<string, string> = {
  prenom: "first_name",
  nom: "last_name",
  nom_complet: "full_name",
  telephone: "phone",
  poste: "job_title",
  service: "department",
  entreprise: "company",
  adresse: "street_address",
  ville: "city",
  departement: "state",
  code_postal: "postal_code",
  pays: "country",
  numero: "number",
  objet: "subject",
  statut: "status",
};

/**
 * An HTML template whose former variables — French ("{{demande.numero}}"),
 * or the requester as "{{sender.email}}" — are rewritten as today
 * ("{{ticket.number}}", "{{requester.email}}"); the rest as is. Used by the
 * database migrations.
 */
export const migrateSupportTemplate = (template: string): string =>
  template.replace(/\{\{(\s*)([\w.]+)(\s*)\}\}/g, (match, before: string, key: string, after: string) => {
    const [group, field, ...rest] = key.split(".");
    if (rest.length > 0 || !group || !field || !Object.hasOwn(LEGACY_VARIABLE_GROUPS, group)) {
      return match;
    }
    const renamed = Object.hasOwn(LEGACY_VARIABLE_FIELDS, field) ? LEGACY_VARIABLE_FIELDS[field] : field;
    return `{{${before}${LEGACY_VARIABLE_GROUPS[group]}.${renamed}${after}}}`;
  });

/**
 * The record of a person, as the variables cite it: the Entra one,
 * or, failing that, what Milo knows — their name, their address. Its fields are
 * those of the variables ("{{user.first_name}}").
 */
export interface SupportPerson {
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string;
  mobile: string;
  job_title: string;
  department: string;
  company: string;
  street_address: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

export const emptySupportPerson = (): SupportPerson => ({
  first_name: "",
  last_name: "",
  full_name: "",
  email: "",
  phone: "",
  mobile: "",
  job_title: "",
  department: "",
  company: "",
  street_address: "",
  city: "",
  state: "",
  postal_code: "",
  country: "",
});

/**
 * The first and last name of a person of whom we only have the display name —
 * the one their email carries. Words entirely in capitals are the last name ("QUINTARD
 * Jérôme"); otherwise, the first word is the first name and the rest the last name.
 */
export const splitPersonName = (full: string): { first_name: string; last_name: string } => {
  const words = full.trim().split(/\s+/).filter(Boolean);
  const isUppercase = (word: string) =>
    /\p{L}{2}/u.test(word) && word === word.toLocaleUpperCase("fr");
  if (words.some(isUppercase) && !words.every(isUppercase)) {
    return {
      first_name: words.filter((m) => !isUppercase(m)).join(" "),
      last_name: words.filter(isUppercase).join(" "),
    };
  }
  return { first_name: words[0] ?? "", last_name: words.slice(1).join(" ") };
};

/** What must be known about a request to fill in its variables. */
export interface RequestWithVariables {
  /** Zero: the request is not created yet, it has no number. */
  number: number;
  subject: string;
  status: SupportStatus;
}

/**
 * What the variables of a template are worth: the user, the sender, the
 * request. An absent person — no sender, no user for
 * an automatically sent reply — leaves their variables empty.
 */
export const supportReplyValues = ({
  user,
  sender,
  request,
}: {
  user?: SupportPerson | null;
  sender?: SupportPerson | null;
  request: RequestWithVariables;
}): Record<string, string> => {
  const values: Record<string, string> = {
    "ticket.number": request.number ? supportTicketRef(request.number) : "",
    "ticket.subject": request.subject,
    "ticket.status": supportStatusLabel(request.status),
  };
  const people = { user, requester: sender };
  for (const v of SUPPORT_REPLY_VARIABLES) {
    const [who, field] = v.key.split(".") as [string, keyof SupportPerson];
    if (who === "ticket") continue;
    values[v.key] = people[who as keyof typeof people]?.[field] ?? "";
  }
  return values;
};

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * An HTML template in which "{{ticket.number}}" is replaced by its value,
 * escaped; an unknown variable is left as is.
 */
/**
 * Where the cursor goes when a predefined reply drops into the editor: cited
 * in a template, "{{cursor}}" is taken out there, and the cursor put in its
 * place — the first one, when several contents carry it. Never sent.
 */
export const CURSOR_VARIABLE = {
  group: "Rédaction",
  key: "cursor",
  label: "Curseur",
  sample: "",
} as const;

export const CURSOR_TOKEN = `{{${CURSOR_VARIABLE.key}}}`;

/** A message without its cursor marks: what goes out. */
export const withoutCursor = (html: string): string =>
  html.replace(/\{\{\s*cursor\s*\}\}/g, "");

export const fillSupportTemplate = (template: string, values: Record<string, string>): string =>
  template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) =>
    key in values ? escapeHtml(values[key]!) : match,
  );

export interface SupportSettings {
  /**
   * The due date automatically given to a request that arrives by email, in business
   * days after its receipt. Zero: no due date.
   */
  default_due_days: number;
}

/** A Support default reply: a title, and its HTML template. */
export interface SupportReply {
  id: Id;
  name: string;
  html: string;
  /** The event that sends it automatically; "null": it only goes out by hand. */
  event: SupportReplyEvent | null;
}

/** Beyond this, a "default" due date is no longer one. */
export const SUPPORT_DUE_DAYS_MAX = 60;

export const emptySupportSettings = (): SupportSettings => ({
  default_due_days: 0,
});

/** A calendar date, without time or time zone. */
export interface CalendarDay {
  year: number;
  /** From 1 to 12. */
  months: number;
  day: number;
}

const key = (year: number, months: number, day: number): string =>
  `${year}-${String(months).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/** Easter Sunday (anonymous Gregorian algorithm). */
const easter = (year: number): Date => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const months = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, months - 1, day));
};

const holidays = new Map<number, Set<string>>();

/** Public holidays of metropolitan France, for a year. */
const holidaysOf = (year: number): Set<string> => {
  const already = holidays.get(year);
  if (already) return already;
  const sunday = easter(year);
  const afterEaster = (n: number) => {
    const date = new Date(sunday.getTime() + n * 86_400_000);
    return key(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  };
  const days = new Set([
    key(year, 1, 1),
    afterEaster(1), // Easter Monday
    key(year, 5, 1),
    key(year, 5, 8),
    afterEaster(39), // Ascension
    afterEaster(50), // Whit Monday
    key(year, 7, 14),
    key(year, 8, 15),
    key(year, 11, 1),
    key(year, 11, 11),
    key(year, 12, 25),
  ]);
  holidays.set(year, days);
  return days;
};

/**
 * The business day that falls `n` business days after `start`: neither Saturday,
 * nor Sunday, nor a public holiday. The start day does not count — received on a Friday,
 * "one day" falls on Monday.
 */
export const addBusinessDays = (start: CalendarDay, n: number): CalendarDay => {
  const date = new Date(Date.UTC(start.year, start.months - 1, start.day));
  let remaining = Math.max(0, Math.floor(n));
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const week = date.getUTCDay();
    const year = date.getUTCFullYear();
    const holiday = holidaysOf(year).has(key(year, date.getUTCMonth() + 1, date.getUTCDate()));
    if (week !== 0 && week !== 6 && !holiday) remaining -= 1;
  }
  return { year: date.getUTCFullYear(), months: date.getUTCMonth() + 1, day: date.getUTCDate() };
};
