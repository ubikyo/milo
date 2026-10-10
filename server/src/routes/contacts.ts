// The contacts of a board (shared, contacts.ts): entered by hand in its
// "Contact" widgets, each in its own (LIST_KEY), with their labels, and
// their board's lists — payment terms, currencies, countries. They follow the
// permission on their widget type, "Logistique", like their labels.
//
// Each has its thread, as a card: Milo notes its creation and its edits
// there (lib/history.ts); the comments are written one by one.

import { Router } from "express";
import type { Request } from "express";
import {
  CONTACT_CODE_MAX,
  CONTACT_EMAIL_MAX,
  CONTACT_EMAIL_PATTERN,
  CONTACT_FIELD_MAX,
  CONTACT_LIST_TYPE,
  CONTACT_NAME_MAX,
  CONTACT_ROWS_MAX,
  CONTACT_SETTINGS_DEFAULTS,
  CONTACT_SYMBOL_MAX,
  CONTACT_URL_MAX,
  CONTACT_URL_PATTERN,
  accessIncludes,
  contactName,
  contactTypeLabel,
  isContactType,
} from "@milo/shared";
import type {
  Contact,
  ContactAddress,
  ContactComment,
  ContactCountry,
  ContactCurrency,
  ContactPaymentTerm,
  ContactPhone,
  ContactSettings,
  ContactType,
  ContactWebsite,
  Id,
  Label,
  SqliteBool,
  WidgetAccess,
} from "@milo/shared";
import { mutation, selection, transaction } from "../db/query.js";
import type { WithAuthorColumns } from "../db/rows.js";
import { changes, list, logAction, quote } from "../lib/history.js";
import type { Field } from "../lib/history.js";
import { HttpError, badRequest, forbidden, orNotFound, requireText, toIds } from "../lib/http.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { openBoard, requireBoardControl } from "../repositories/boards.js";
import { SYSTEM_COMMENT, creationNote, withAuthor } from "../repositories/comments.js";
import { keyInBoard } from "../repositories/lists.js";
import { widgetRights } from "../repositories/users.js";

const NOT_FOUND = "Contact introuvable";

/** A contact as stored: its lists as JSON. */
interface ContactRow {
  id: Id;
  board_id: Id;
  list_key: string;
  first_name: string;
  name: string;
  type: string;
  job_title: string;
  emails: string;
  phones: string;
  addresses: string;
  websites: string;
  payment_term: string;
  currency: string;
  created_at: string;
  updated_at: string;
}

/** A stored JSON list; unreadable, none. */
const parsed = <T>(saved: string | undefined): T[] => {
  if (!saved) return [];
  try {
    const list = JSON.parse(saved) as unknown;
    return Array.isArray(list) ? (list as T[]) : [];
  } catch {
    return [];
  }
};

/** A short text, trimmed and checked for length. */
const text = (value: unknown, max: number, what: string): string => {
  const read = String(value ?? "").trim();
  if (read.length > max) badRequest(`${what} tient en ${max} caractères`);
  return read;
};

/**
 * A received list of rows, each read by "row": rows it returns null for —
 * empty — are left out. "what" names the list in the messages.
 */
const rowsOf = <T>(
  value: unknown,
  what: string,
  row: (entry: Record<string, unknown>) => T | null,
  max = CONTACT_ROWS_MAX,
): T[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) badRequest(`${what} sont une liste`);
  const list: T[] = [];
  for (const entry of value as unknown[]) {
    const read = row((entry ?? {}) as Record<string, unknown>);
    if (read) list.push(read);
  }
  if (list.length > max) badRequest(`${what} tiennent en ${max} lignes`);
  return list;
};

const emailsOf = (value: unknown): string[] => {
  const seen = new Set<string>();
  return rowsOf(value, "Les e-mails", (entry) => {
    // Received as plain strings, or as rows.
    const email = text(typeof entry === "object" ? entry.value : entry, CONTACT_EMAIL_MAX, "Un e-mail");
    if (!email) return null;
    if (!CONTACT_EMAIL_PATTERN.test(email)) badRequest(`« ${email} » n'est pas une adresse e-mail`);
    if (seen.has(email.toLowerCase())) badRequest(`« ${email} » figure deux fois`);
    seen.add(email.toLowerCase());
    return email;
  });
};

const phonesOf = (value: unknown): ContactPhone[] =>
  rowsOf(value, "Les numéros de téléphone", (entry) => {
    const number = text(entry.number, CONTACT_FIELD_MAX, "Un numéro");
    const label = text(entry.label, CONTACT_FIELD_MAX, "Un libellé");
    if (!number) return null;
    return { label, number };
  });

const addressesOf = (value: unknown): ContactAddress[] =>
  rowsOf(value, "Les adresses", (entry) => {
    const address = {
      label: text(entry.label, CONTACT_FIELD_MAX, "Un nom"),
      line1: text(entry.line1, CONTACT_FIELD_MAX, "Une adresse"),
      line2: text(entry.line2, CONTACT_FIELD_MAX, "Une adresse"),
      postal_code: text(entry.postal_code, CONTACT_FIELD_MAX, "Un code postal"),
      city: text(entry.city, CONTACT_FIELD_MAX, "Une ville"),
      country: text(entry.country, CONTACT_FIELD_MAX, "Un pays"),
    };
    const { label: _label, ...place } = address;
    return Object.values(place).some(Boolean) ? address : null;
  });

/** A website's address: "http://" or "https://" required, then a host. */
const websiteOf = (typed: string): string => {
  if (!CONTACT_URL_PATTERN.test(typed) || !URL.canParse(typed)) {
    badRequest(`« ${typed} » n'est pas l'adresse d'un site web (http:// ou https://)`);
  }
  return typed;
};

const websitesOf = (value: unknown): ContactWebsite[] =>
  rowsOf(value, "Les sites internet", (entry) => {
    const url = text(entry.url, CONTACT_URL_MAX, "Une adresse");
    const label = text(entry.label, CONTACT_FIELD_MAX, "Un libellé");
    if (!url) return null;
    return { label, url: websiteOf(url) };
  });

/** The fields a contact is written with, read from the request. */
const fieldsOf = (body: Record<string, unknown>) => {
  const type: ContactType = body.type === undefined ? "person" : (body.type as ContactType);
  if (!isContactType(type)) badRequest("Type de contact inconnu");
  const company = type === "company";
  return {
    // A company has a name alone.
    first_name: company ? "" : text(body.first_name, CONTACT_NAME_MAX, "Un prénom"),
    name: text(requireText(body.name, "Le champ « Nom » est requis"), CONTACT_NAME_MAX, "Un nom"),
    type,
    // A company has no job title; a person, no website: what may linger
    // from the other type is dropped.
    job_title: company ? "" : text(body.job_title, CONTACT_FIELD_MAX, "Une fonction"),
    emails: JSON.stringify(emailsOf(body.emails)),
    phones: JSON.stringify(phonesOf(body.phones)),
    addresses: JSON.stringify(addressesOf(body.addresses)),
    websites: JSON.stringify(company ? websitesOf(body.websites) : []),
    // Nor has a person payment terms or a currency.
    payment_term: company ? text(body.payment_term, CONTACT_FIELD_MAX, "Une condition") : "",
    currency: company ? text(body.currency, CONTACT_FIELD_MAX, "Une devise") : "",
  };
};

// --- Reading -----------------------------------------------------------------

const ofBoard = selection<ContactRow>(
  "SELECT * FROM contacts WHERE board_id = ? ORDER BY name COLLATE NOCASE, id",
);
const byId = selection<ContactRow>("SELECT * FROM contacts WHERE id = ?");
const labelsOfBoard = selection<Label & { contact_id: Id }>(
  `SELECT k.contact_id, l.* FROM contact_label_links k
   JOIN contact_labels l ON l.id = k.label_id
   JOIN contacts c ON c.id = k.contact_id
   WHERE c.board_id = ? ORDER BY l.position, l.id`,
);
const membersOfBoard = selection<{ company_id: Id; member_id: Id }>(
  `SELECT m.company_id, m.member_id FROM contact_members m
   JOIN contacts c ON c.id = m.company_id
   WHERE c.board_id = ? ORDER BY m.position, m.member_id`,
);

/** A board's contacts, each with its labels and, a company, its people. */
const contactsOf = (boardId: Id): Contact[] => {
  const labels = new Map<Id, Label[]>();
  for (const { contact_id, ...label } of labelsOfBoard.all(boardId)) {
    labels.set(contact_id, [...(labels.get(contact_id) ?? []), label]);
  }
  const members = new Map<Id, Id[]>();
  for (const { company_id, member_id } of membersOfBoard.all(boardId)) {
    members.set(company_id, [...(members.get(company_id) ?? []), member_id]);
  }
  return ofBoard.all(boardId).map((row) => ({
    ...row,
    type: isContactType(row.type) ? row.type : "person",
    emails: parsed<string>(row.emails),
    phones: parsed<ContactPhone>(row.phones),
    // An address saved with its "street", before its two lines: the first.
    addresses: parsed<ContactAddress & { street?: string }>(row.addresses).map(
      ({ street, ...a }) => ({ ...a, line1: a.line1 ?? street ?? "", line2: a.line2 ?? "" }),
    ),
    websites: parsed<ContactWebsite>(row.websites),
    member_ids: members.get(row.id) ?? [],
    labels: labels.get(row.id) ?? [],
  }));
};

const oneContact = (row: ContactRow): Contact =>
  contactsOf(row.board_id).find((c) => c.id === row.id)!;

// --- Its thread --------------------------------------------------------------

const NONE = "—";

/** The rows of one of its lists, in their order. */
const inOrder = (values: string[]): string => values.filter(Boolean).join(", ") || NONE;

/** An address on one line: "Siège : 1 rue …, 75001 Paris, France". */
const addressLine = (a: ContactAddress): string => {
  const place = [a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(" "), a.country]
    .filter(Boolean)
    .join(", ");
  return a.label ? `${a.label} : ${place}` : place;
};

/** What the thread notes about a contact when its record changes (lib/history.ts). */
const photo = (id: Id): Field[] => {
  const all = contactsOf(byId.get(id)!.board_id);
  const c = all.find((k) => k.id === id)!;
  const names = new Map(all.map((k) => [k.id, contactName(k)]));
  return [
    { label: "Type", value: contactTypeLabel(c.type) },
    { label: "Prénom", value: quote(c.first_name) },
    { label: "Nom", value: quote(c.name) },
    { label: "Fonction", value: quote(c.job_title) },
    { label: "Contacts", value: list(c.member_ids.map((m) => names.get(m) ?? "")) },
    { label: "Conditions de paiement", value: c.payment_term || NONE },
    { label: "Devise", value: c.currency || NONE },
    { label: "E-mails", value: inOrder(c.emails) },
    {
      label: "Numéros de téléphone",
      value: inOrder(c.phones.map((p) => [p.label, p.number].filter(Boolean).join(" "))),
    },
    { label: "Adresses", value: inOrder(c.addresses.map(addressLine)) },
    { label: "Sites internet", value: inOrder(c.websites.map((w) => w.url)) },
    { label: "Étiquettes", value: list(c.labels.map((l) => l.name)) },
  ];
};

const COMMENT_NOT_FOUND = "Commentaire introuvable";

interface CommentRow {
  id: Id;
  contact_id: Id;
  user_id: Id | null;
  text: string;
  system: SqliteBool;
  created_at: string;
  updated_at: string;
}

const COMMENT_SELECT = `
  SELECT contact_comments.*, users.name AS author_name, users.email AS author_email
  FROM contact_comments
  LEFT JOIN users ON users.id = contact_comments.user_id
`;

const comments = {
  raw: selection<CommentRow>("SELECT * FROM contact_comments WHERE id = ?"),
  byId: selection<WithAuthorColumns<CommentRow>>(`${COMMENT_SELECT} WHERE contact_comments.id = ?`),
  ofContact: selection<WithAuthorColumns<CommentRow>>(
    `${COMMENT_SELECT} WHERE contact_comments.contact_id = ?
     ORDER BY contact_comments.created_at ASC, contact_comments.id ASC`,
  ),
  create: mutation(
    `INSERT INTO contact_comments (contact_id, user_id, text, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ),
  // A note from Milo: no account behind it.
  createSystem: mutation(
    `INSERT INTO contact_comments (contact_id, user_id, text, system, created_at, updated_at)
     VALUES (?, NULL, ?, 1, ?, ?)`,
  ),
  update: mutation("UPDATE contact_comments SET text = ?, updated_at = ? WHERE id = ?"),
  remove: mutation("DELETE FROM contact_comments WHERE id = ?"),
};

const commentOf = (row: WithAuthorColumns<CommentRow>): ContactComment => withAuthor(row);

// --- Writing -----------------------------------------------------------------

const insert = mutation(
  `INSERT INTO contacts (board_id, list_key, first_name, name, type, job_title, emails, phones, addresses, websites,
     payment_term, currency, created_at, updated_at)
   VALUES (@board_id, @list_key, @first_name, @name, @type, @job_title, @emails, @phones, @addresses, @websites,
     @payment_term, @currency, @at, @at)`,
);
const update = mutation(
  `UPDATE contacts SET first_name = @first_name, name = @name, type = @type, job_title = @job_title, emails = @emails, phones = @phones,
     addresses = @addresses, websites = @websites, payment_term = @payment_term,
     currency = @currency, updated_at = @at
   WHERE id = @id`,
);
const remove = mutation("DELETE FROM contacts WHERE id = ?");

const clearLabels = mutation("DELETE FROM contact_label_links WHERE contact_id = ?");
// Only a label of the contact's board.
const addLabel = mutation(
  `INSERT OR IGNORE INTO contact_label_links (contact_id, label_id)
   SELECT ?, id FROM contact_labels WHERE id = ? AND board_id = ?`,
);
const clearMembers = mutation("DELETE FROM contact_members WHERE company_id = ?");
// Only another contact of the company's board.
const addMember = mutation(
  `INSERT OR IGNORE INTO contact_members (company_id, member_id, position)
   SELECT ?, id, ? FROM contacts WHERE id = ? AND id != ? AND board_id = ?`,
);

type Fields = ReturnType<typeof fieldsOf>;

/** The record, its labels and its people, written together. */
const write = transaction(
  (contactId: Id, boardId: Id, fields: Fields, labelIds: Id[], memberIds: Id[]) => {
    update.run({ id: contactId, ...fields, at: now() });
    clearLabels.run(contactId);
    for (const id of labelIds) addLabel.run(contactId, id, boardId);
    clearMembers.run(contactId);
    // A person has no people.
    if (fields.type === "company") {
      memberIds.forEach((id, rank) => addMember.run(contactId, rank, id, contactId, boardId));
    }
  },
);

const create = transaction(
  (boardId: Id, listKey: string, fields: Fields, labelIds: Id[], memberIds: Id[]): Id => {
    const { lastInsertRowid } = insert.run({ board_id: boardId, list_key: listKey, ...fields, at: now() });
    const id = Number(lastInsertRowid);
    write(id, boardId, fields, labelIds, memberIds);
    return id;
  },
);

/** The permission on the "Logistique" type a request needs. */
const requireAccess = (req: Request, access: WidgetAccess): void => {
  if (!accessIncludes(widgetRights(req.user).logistics, access)) {
    throw access === "view"
      ? new HttpError(404, "Introuvable")
      : new HttpError(403, "Vous n'avez pas le droit de modifier ici");
  }
};

/** The board, if this person sees it and holds this permission on the widget type. */
const verifyBoard = (req: Request, boardId: unknown, access: WidgetAccess): Id => {
  requireAccess(req, access);
  return openBoard(boardId, req.user).id;
};

/** The contact, if this person may act on it this way. */
const openContact = (req: Request, id: unknown, access: WidgetAccess): ContactRow => {
  const contact = orNotFound(byId.get(id), NOT_FOUND);
  verifyBoard(req, contact.board_id, access);
  return contact;
};

export const contactRoutes = Router();

contactRoutes.use(touch("contacts"));

contactRoutes.get("/", (req, res) => {
  const { board } = req.query;
  if (!board) badRequest("Le paramètre board est requis");
  res.json(contactsOf(verifyBoard(req, board, "view")));
});

contactRoutes.post("/", (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (!body.board_id) badRequest("Le tableau est requis");
  const boardId = verifyBoard(req, body.board_id, "update");
  const id = create(
    boardId,
    // The widget named, if it is one of this board's; otherwise its first.
    keyInBoard(boardId, CONTACT_LIST_TYPE, body.list_key),
    fieldsOf(body),
    toIds(body.label_ids),
    toIds(body.member_ids),
  );
  // A contact's thread opens on its creation.
  const at = now();
  comments.createSystem.run(id, creationNote("Contact créé", at, req.user.id), at, at);
  res.status(201).json(oneContact(byId.get(id)!));
});

contactRoutes.put("/:id", (req, res) => {
  const existing = openContact(req, req.params.id, "update");
  const body = (req.body ?? {}) as Record<string, unknown>;
  const before = photo(existing.id);
  write(existing.id, existing.board_id, fieldsOf(body), toIds(body.label_ids), toIds(body.member_ids));
  // A record saved without changes notes nothing.
  logAction("contact", existing.id, req.user, changes(before, photo(existing.id)));
  res.json(oneContact(byId.get(existing.id)!));
});

contactRoutes.delete("/:id", (req, res) => {
  const existing = openContact(req, req.params.id, "delete");
  remove.run(existing.id);
  res.status(204).end();
});

// A contact's thread, read when its "Commentaires" tab is.
contactRoutes.get("/:id/comments", (req, res) => {
  const contact = openContact(req, req.params.id, "view");
  res.json(comments.ofContact.all(contact.id).map(commentOf));
});

// Writing in a contact's thread means editing it.
contactRoutes.post("/:id/comments", (req, res) => {
  const contact = openContact(req, req.params.id, "update");
  const body = requireText(req.body?.text, "text est requis");
  const at = now();
  const { lastInsertRowid } = comments.create.run(contact.id, req.user.id, body, at, at);
  res.status(201).json(commentOf(comments.byId.get(lastInsertRowid)!));
});

contactRoutes.put("/comments/:comment", (req, res) => {
  const comment = orNotFound(comments.raw.get(req.params.comment), COMMENT_NOT_FOUND);
  if (comment.system) forbidden(SYSTEM_COMMENT);
  openContact(req, comment.contact_id, "update");
  const body = requireText(req.body?.text, "text est requis");
  // An identical text is not a modification: the comment's date stays.
  if (body !== comment.text) comments.update.run(body, now(), comment.id);
  res.json(commentOf(comments.byId.get(comment.id)!));
});

contactRoutes.delete("/comments/:comment", (req, res) => {
  const comment = orNotFound(comments.raw.get(req.params.comment), COMMENT_NOT_FOUND);
  if (comment.system) forbidden(SYSTEM_COMMENT);
  openContact(req, comment.contact_id, "update");
  comments.remove.run(comment.id);
  res.status(204).end();
});

// --- The board's lists -------------------------------------------------------

const readSettings = selection<{ payment_terms: string; currencies: string; countries: string }>(
  "SELECT payment_terms, currencies, countries FROM board_contact_settings WHERE board_id = ?",
);
const ensureSettings = mutation("INSERT OR IGNORE INTO board_contact_settings (board_id) VALUES (?)");
const writePaymentTerms = mutation("UPDATE board_contact_settings SET payment_terms = ? WHERE board_id = ?");
const writeCurrencies = mutation("UPDATE board_contact_settings SET currencies = ? WHERE board_id = ?");
const writeCountries = mutation("UPDATE board_contact_settings SET countries = ? WHERE board_id = ?");

/** A board's lists; without a row, their defaults. */
const settingsOf = (boardId: Id): ContactSettings => {
  const row = readSettings.get(boardId);
  if (!row) return CONTACT_SETTINGS_DEFAULTS;
  return {
    payment_terms: parsed<ContactPaymentTerm>(row.payment_terms),
    currencies: parsed<ContactCurrency>(row.currencies),
    countries: parsed<ContactCountry>(row.countries),
  };
};

/** Each name appears once, case aside: "what" names the list. */
const unique = <T extends { name: string }>(list: T[]): T[] => {
  const seen = new Set<string>();
  for (const { name } of list) {
    if (seen.has(name.toLowerCase())) badRequest(`« ${name} » figure deux fois`);
    seen.add(name.toLowerCase());
  }
  return list;
};

const paymentTermsOf = (value: unknown): ContactPaymentTerm[] =>
  unique(
    rowsOf(value, "Les conditions de paiement", (entry) => {
      const name = text(entry.name, CONTACT_FIELD_MAX, "Une condition");
      return name ? { name } : null;
    }),
  );

/** Every country of the world fits. */
const COUNTRIES_MAX = 300;

const countriesOf = (value: unknown): ContactCountry[] =>
  unique(
    rowsOf(value, "Les pays", (entry) => {
      const name = text(entry.name, CONTACT_FIELD_MAX, "Un pays");
      return name ? { name } : null;
    }, COUNTRIES_MAX),
  );

const currenciesOf = (value: unknown): ContactCurrency[] =>
  unique(
    rowsOf(value, "Les devises", (entry) => {
      const name = text(entry.name, CONTACT_FIELD_MAX, "Un libellé");
      const code = text(entry.code, CONTACT_CODE_MAX, "Un code").toUpperCase();
      const symbol = text(entry.symbol, CONTACT_SYMBOL_MAX, "Un symbole");
      if (!name && !code && !symbol) return null;
      if (!name) badRequest(`La devise « ${code} » n'a pas de libellé`);
      if (!code) badRequest(`La devise « ${name} » n'a pas de code`);
      return { name, code, symbol };
    }),
  );

const saveSettings = transaction((boardId: Id, lists: Partial<ContactSettings>) => {
  ensureSettings.run(boardId);
  if (lists.payment_terms) writePaymentTerms.run(JSON.stringify(lists.payment_terms), boardId);
  if (lists.currencies) writeCurrencies.run(JSON.stringify(lists.currencies), boardId);
  if (lists.countries) writeCountries.run(JSON.stringify(lists.countries), boardId);
});

/**
 * The lists of a board's Contact widgets: not a widget's configuration but
 * the board's — every Contact widget on it shares them.
 */
export const contactSettingsRoutes = Router();

contactSettingsRoutes.use(touch("contacts"));

contactSettingsRoutes.get("/", (req, res) => {
  res.json(settingsOf(verifyBoard(req, req.query.board, "view")));
});

/** Each received list is replaced entirely; a list not sent stays as it is. */
contactSettingsRoutes.put("/", (req, res) => {
  requireAccess(req, "update");
  const board = openBoard(req.query.board, req.user);
  requireBoardControl(board, req.user);
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (body.payment_terms === undefined && body.currencies === undefined && body.countries === undefined) {
    badRequest("Rien à enregistrer");
  }
  // Everything is checked before writing: a rejected list does not leave
  // the other half saved.
  const payment_terms = body.payment_terms === undefined ? undefined : paymentTermsOf(body.payment_terms);
  const currencies = body.currencies === undefined ? undefined : currenciesOf(body.currencies);
  const countries = body.countries === undefined ? undefined : countriesOf(body.countries);
  saveSettings(board.id, { payment_terms, currencies, countries });
  res.json(settingsOf(board.id));
});
