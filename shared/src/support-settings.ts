// Les réglages de la section « Support » du Paramétrage, et le calcul des
// jours ouvrés qui s'en sert. Ils valent pour toute l'application.

import { supportStatusLabel, supportTicketRef } from "./domain.js";
import type { Id, SupportStatus } from "./domain.js";

/**
 * Ce qui envoie d'office une réponse par défaut à l'expéditeur d'une demande
 * reçue par e-mail. L'arrivée et la relance viennent de la boîte de support ;
 * les autres suivent le statut de la demande.
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
 * Quand un contenu par défaut se pose dans l'éditeur d'une réponse de l'équipe.
 * « Tout message » s'ajoute à la fin de tous — une signature ; les autres
 * suivent le fil de la demande, et passent devant :
 * - « Nouveau message » : le fil est vide, l'équipe écrit la première ;
 * - « Première réponse » : l'expéditeur a écrit, l'équipe pas encore ;
 * - « Réponse suivante » : l'équipe a déjà répondu.
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
 * Un contenu par défaut du Support : un intitulé, son modèle HTML, et
 * l'évènement qui le pose dans l'éditeur d'une réponse.
 */
export interface SupportContent {
  id: Id;
  name: string;
  html: string;
  /** « null » : il ne se pose nulle part. */
  event: SupportContentEvent | null;
}

/** D'où vient une variable : le compte qui écrit, l'expéditeur, la demande. */
export const SUPPORT_VARIABLE_GROUPS = ["Utilisateur", "Expéditeur", "Demande"] as const;

export type SupportVariableGroup = (typeof SUPPORT_VARIABLE_GROUPS)[number];

/**
 * Ce qu'un modèle peut citer : « {{demande.numero}} » devient « HLP-12 » dans
 * le message. L'utilisateur est le compte connecté, l'expéditeur celui de la
 * demande : leurs fiches viennent d'Entra.
 */
export const SUPPORT_REPLY_VARIABLES = [
  { group: "Utilisateur", key: "utilisateur.prenom", label: "Prénom" },
  { group: "Utilisateur", key: "utilisateur.nom", label: "Nom" },
  { group: "Utilisateur", key: "utilisateur.nom_complet", label: "Nom complet" },
  { group: "Utilisateur", key: "utilisateur.email", label: "Adresse e-mail" },
  { group: "Utilisateur", key: "utilisateur.telephone", label: "Téléphone professionnel" },
  { group: "Utilisateur", key: "utilisateur.mobile", label: "Téléphone mobile" },
  { group: "Utilisateur", key: "utilisateur.poste", label: "Poste" },
  { group: "Utilisateur", key: "utilisateur.service", label: "Département" },
  { group: "Utilisateur", key: "utilisateur.entreprise", label: "Nom de l'entreprise" },
  { group: "Utilisateur", key: "utilisateur.adresse", label: "Adresse postale" },
  { group: "Utilisateur", key: "utilisateur.ville", label: "Ville" },
  { group: "Utilisateur", key: "utilisateur.departement", label: "Département (adresse)" },
  { group: "Utilisateur", key: "utilisateur.code_postal", label: "Code postal" },
  { group: "Utilisateur", key: "utilisateur.pays", label: "Pays" },
  { group: "Expéditeur", key: "expediteur.prenom", label: "Prénom" },
  { group: "Expéditeur", key: "expediteur.nom", label: "Nom" },
  { group: "Expéditeur", key: "expediteur.nom_complet", label: "Nom complet" },
  { group: "Expéditeur", key: "expediteur.email", label: "Adresse e-mail" },
  { group: "Demande", key: "demande.numero", label: "Numéro" },
  { group: "Demande", key: "demande.objet", label: "Objet" },
  { group: "Demande", key: "demande.statut", label: "Statut" },
] as const satisfies readonly {
  group: SupportVariableGroup;
  key: string;
  label: string;
}[];

/**
 * La fiche d'une personne, telle que les variables la citent : celle d'Entra,
 * ou, à défaut, ce qu'en sait Milo — son nom, son adresse.
 */
export interface SupportPerson {
  firstName: string;
  name: string;
  full_name: string;
  email: string;
  telephone: string;
  mobile: string;
  jobTitle: string;
  service: string;
  company: string;
  address: string;
  city: string;
  department: string;
  postal_code: string;
  country: string;
}

export const emptySupportPerson = (): SupportPerson => ({
  firstName: "",
  name: "",
  full_name: "",
  email: "",
  telephone: "",
  mobile: "",
  jobTitle: "",
  service: "",
  company: "",
  address: "",
  city: "",
  department: "",
  postal_code: "",
  country: "",
});

/**
 * Le prénom et le nom d'une personne dont on n'a que le nom affiché — celui
 * que porte son e-mail. Les mots tout en capitales sont le nom (« QUINTARD
 * Jérôme ») ; sinon, le premier mot est le prénom et la suite le nom.
 */
export const splitPersonName = (full: string): { firstName: string; name: string } => {
  const words = full.trim().split(/\s+/).filter(Boolean);
  const isUppercase = (word: string) =>
    /\p{L}{2}/u.test(word) && word === word.toLocaleUpperCase("fr");
  if (words.some(isUppercase) && !words.every(isUppercase)) {
    return {
      firstName: words.filter((m) => !isUppercase(m)).join(" "),
      name: words.filter(isUppercase).join(" "),
    };
  }
  return { firstName: words[0] ?? "", name: words.slice(1).join(" ") };
};

/** Ce qu'il faut savoir d'une demande pour en remplir les variables. */
export interface RequestWithVariables {
  /** Zéro : la demande n'est pas encore créée, elle n'a pas de numéro. */
  number: number;
  subject: string;
  status: SupportStatus;
}

/**
 * Ce que valent les variables d'un modèle : l'utilisateur, l'expéditeur, la
 * demande. Une personne absente — pas d'expéditeur, pas d'utilisateur pour
 * une réponse partie d'office — laisse ses variables vides.
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
    "demande.numero": request.number ? supportTicketRef(request.number) : "",
    "demande.objet": request.subject,
    "demande.statut": supportStatusLabel(request.status),
  };
  const people = { user, sender };
  for (const v of SUPPORT_REPLY_VARIABLES) {
    const [who, field] = v.key.split(".") as [string, keyof SupportPerson];
    if (who === "demande") continue;
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
 * Un modèle HTML dont « {{demande.numero}} » est remplacé par sa valeur,
 * échappée ; une variable inconnue reste telle quelle.
 */
export const fillSupportTemplate = (template: string, values: Record<string, string>): string =>
  template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) =>
    key in values ? escapeHtml(values[key]!) : match,
  );

export interface SupportSettings {
  /**
   * L'échéance donnée d'office à une demande qui arrive par e-mail, en jours
   * ouvrés après sa réception. Zéro : pas d'échéance.
   */
  default_due_days: number;
  /**
   * Les étiquettes posées d'office sur une demande qui arrive par e-mail.
   * Tant que le Paramétrage n'en a pas choisi, la priorité la plus légère.
   */
  default_label_ids: Id[];
}

/** Une réponse par défaut du Support : un intitulé, et son modèle HTML. */
export interface SupportReply {
  id: Id;
  name: string;
  html: string;
  /** L'évènement qui l'envoie d'office ; « null » : elle ne part qu'à la main. */
  event: SupportReplyEvent | null;
}

/** Au-delà, une échéance « par défaut » n'en est plus une. */
export const SUPPORT_DUE_DAYS_MAX = 60;

export const emptySupportSettings = (): SupportSettings => ({
  default_due_days: 0,
  default_label_ids: [],
});

/** Une date du calendrier, sans heure ni fuseau. */
export interface CalendarDay {
  year: number;
  /** De 1 à 12. */
  months: number;
  day: number;
}

const key = (year: number, months: number, day: number): string =>
  `${year}-${String(months).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/** Le dimanche de Pâques (algorithme grégorien anonyme). */
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

/** Les jours fériés de France métropolitaine, pour une année. */
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
    afterEaster(1), // lundi de Pâques
    key(year, 5, 1),
    key(year, 5, 8),
    afterEaster(39), // Ascension
    afterEaster(50), // lundi de Pentecôte
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
 * Le jour ouvré qui tombe `n` jours ouvrés après `depart` : ni samedi, ni
 * dimanche, ni jour férié. Le jour de départ ne compte pas — reçu un vendredi,
 * « un jour » tombe le lundi.
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
