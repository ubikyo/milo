// The contacts: people and companies entered by hand in a board's "Contact"
// widgets (group "Logistique"), each in its own (LIST_KEY), with their labels,
// e-mails, phone numbers, addresses and websites — every list in its order.
// A company also carries its people — contacts of its board —, its payment
// terms and its currency, chosen among its board's lists: those are not a
// widget's configuration but the board's, shared by every Contact widget on
// it, as its labels.

import type { Id, Label } from "./domain.js";

/** The widget that owns its contacts (LIST_KEY). */
export const CONTACT_LIST_TYPE = "contact.list";

/** The routes: "/api/contacts", "/api/contact-labels", "/api/contact-settings". */
export const CONTACT_ROUTES = {
  contacts: "/contacts",
  labels: "/contact-labels",
  settings: "/contact-settings",
} as const;

export const CONTACT_TYPES = [
  { value: "person", label: "Personne" },
  { value: "company", label: "Société" },
] as const;

export type ContactType = (typeof CONTACT_TYPES)[number]["value"];

export const isContactType = (value: unknown): value is ContactType =>
  CONTACT_TYPES.some((t) => t.value === value);

export const contactTypeLabel = (type: ContactType): string =>
  CONTACT_TYPES.find((t) => t.value === type)?.label ?? type;

/**
 * The context group a board with a Contact widget offers, beside its label
 * groups: not labels but the contact types — "Société", "Personne" — which
 * filter its Contact widgets.
 */
export const CONTACT_TYPE_GROUP = "Type de contact";

/** The contexts of that group, in the selector's order. */
export const CONTACT_TYPE_CONTEXTS = ["company", "person"].map((t) =>
  contactTypeLabel(t as ContactType),
);

export interface ContactPhone {
  label: string;
  number: string;
}

/** An address: its name ("Siège"), two lines, then its town. */
export interface ContactAddress {
  label: string;
  line1: string;
  line2: string;
  postal_code: string;
  city: string;
  country: string;
}

export interface ContactWebsite {
  label: string;
  url: string;
}

export interface Contact {
  id: Id;
  board_id: Id;
  list_key: string;
  /** A person's first name; empty for a company. */
  first_name: string;
  name: string;
  type: ContactType;
  /** A person's job title; empty for a company. */
  job_title: string;
  emails: string[];
  phones: ContactPhone[];
  addresses: ContactAddress[];
  /** A company's; a person has none. */
  websites: ContactWebsite[];
  /** A company's: names from its board's lists; empty for a person. */
  payment_term: string;
  currency: string;
  /** A company's people, in their order: contacts of its board. */
  member_ids: Id[];
  labels: Label[];
  created_at: string;
  updated_at: string;
}

export interface ContactInput {
  first_name: string;
  name: string;
  type: ContactType;
  job_title: string;
  emails: string[];
  phones: ContactPhone[];
  addresses: ContactAddress[];
  websites: ContactWebsite[];
  payment_term: string;
  currency: string;
  member_ids: Id[];
  label_ids: Id[];
}

// --- The board's lists -------------------------------------------------------

export interface ContactPaymentTerm {
  name: string;
}

export interface ContactCurrency {
  name: string;
  code: string;
  symbol: string;
}

export interface ContactCountry {
  name: string;
}

export interface ContactSettings {
  payment_terms: ContactPaymentTerm[];
  currencies: ContactCurrency[];
  /** The countries an address picks from: the first is a new address's. */
  countries: ContactCountry[];
}

/** A board's lists until it records its own. */
export const CONTACT_SETTINGS_DEFAULTS: ContactSettings = {
  payment_terms: [
    "Paiement immédiat",
    "15 jours",
    "21 jours",
    "30 jours",
    "45 jours",
    "Fin du mois suivant",
    "10 jours après la fin du mois",
    "30% maintenant, le solde à 60 jours",
  ].map((name) => ({ name })),
  currencies: [
    { name: "Euro", code: "EUR", symbol: "€" },
    { name: "US Dollar", code: "USD", symbol: "$" },
  ],
  countries: [
    "France",
    "Belgique",
    "Suisse",
    "Luxembourg",
    "Allemagne",
    "Espagne",
    "Italie",
    "Royaume-Uni",
    "États-Unis",
  ].map((name) => ({ name })),
};

/** The full name of a contact: a person's first name, then its name. */
export const contactName = (c: Pick<Contact, "first_name" | "name">): string =>
  [c.first_name, c.name].filter(Boolean).join(" ");

/**
 * The checks of an e-mail and of a website's address — "http://" or
 * "https://", then a host with a dot —, shared by the drawer and the server.
 */
export const CONTACT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const CONTACT_URL_PATTERN = /^https?:\/\/[^\s/?#.]+(\.[^\s/?#.]+)+(:\d+)?([/?#]\S*)?$/i;

// --- Limits ------------------------------------------------------------------

export const CONTACT_NAME_MAX = 200;
export const CONTACT_FIELD_MAX = 200;
export const CONTACT_EMAIL_MAX = 254;
export const CONTACT_URL_MAX = 500;
/** How many rows each of a contact's lists holds at most. */
export const CONTACT_ROWS_MAX = 50;
export const CONTACT_CODE_MAX = 10;
export const CONTACT_SYMBOL_MAX = 5;
