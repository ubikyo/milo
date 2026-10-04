// Confirmations by code (lib/optin.ts, lib/widget-optin.ts): one row per
// owner — a request list's key, a Calendar or Mail widget's key — and per
// address, in lowercase. See the list_mailbox_optins, calendar_optins and
// mail_optins tables
// (db/schema.ts), which share their columns.

import { mutation, selection } from "../db/query.js";
import { now } from "../lib/time.js";

export interface OptinRow {
  /** The owner's key: the list's, or the calendar's. */
  key: string;
  email: string;
  code: string;
  attempts: number;
  sent_at: string;
  confirmed_at: string;
  created_at: string;
}

const lowercase = (email: string) => email.trim().toLowerCase();

/** What designates a row: the owner and the address, together. */
export const pair = (owner: string, email: string): string => `${owner}|${lowercase(email)}`;

/** The confirmations of one table, whose "keyColumn" names the owner. */
const optinTable = (table: string, keyColumn: string) => {
  const de = selection<OptinRow>(
    `SELECT *, ${keyColumn} AS key FROM ${table} WHERE ${keyColumn} = ? AND email = ?`,
  );
  const all = selection<OptinRow>(`SELECT *, ${keyColumn} AS key FROM ${table}`);
  const create = mutation(
    `INSERT OR IGNORE INTO ${table} (${keyColumn}, email, created_at) VALUES (?, ?, ?)`,
  );
  const newCode = mutation(
    `UPDATE ${table} SET code = ?, attempts = 0, sent_at = ?
     WHERE ${keyColumn} = ? AND email = ?`,
  );
  const confirm = mutation(
    `UPDATE ${table} SET confirmed_at = ?, code = ''
     WHERE ${keyColumn} = ? AND email = ? AND confirmed_at = ''`,
  );
  const attempt = mutation(
    `UPDATE ${table} SET attempts = attempts + 1 WHERE ${keyColumn} = ? AND email = ?`,
  );
  const forgetCode = mutation(
    `UPDATE ${table} SET code = '' WHERE ${keyColumn} = ? AND email = ?`,
  );
  const forget = mutation(`DELETE FROM ${table} WHERE ${keyColumn} = ? AND email = ?`);

  return {
    de: (owner: string, email: string) => de.get(owner, lowercase(email)),
    /** The confirmed pairs (pair()), and since when. */
    confirmed: (): Map<string, string> =>
      new Map(
        all
          .all()
          .filter((o) => o.confirmed_at)
          .map((o) => [pair(o.key, o.email), o.confirmed_at]),
      ),
    /** True when the pair was unknown: it now awaits its confirmation. */
    create: (owner: string, email: string): boolean =>
      create.run(owner, lowercase(email), now()).changes > 0,
    /** The code of the last e-mail sent: the old one is no longer valid. */
    sent: (owner: string, email: string, code: string): void => {
      newCode.run(code, now(), owner, lowercase(email));
    },
    attempt: (owner: string, email: string): void => {
      attempt.run(owner, lowercase(email));
    },
    /** Too many attempts: the code is no longer valid, a resend is needed. */
    forgetCode: (owner: string, email: string): void => {
      forgetCode.run(owner, lowercase(email));
    },
    confirm: (owner: string, email: string): void => {
      confirm.run(now(), owner, lowercase(email));
    },
    /** The pairs no owner mentions anymore: added again, they will be confirmed again. */
    forgetExcept: (keptKeys: Set<string>): void => {
      for (const o of all.all()) {
        if (!keptKeys.has(pair(o.key, o.email))) forget.run(o.key, o.email);
      }
    },
  };
};

export type OptinTable = ReturnType<typeof optinTable>;

/** The support inboxes, by request list. */
export const optins = optinTable("list_mailbox_optins", "list_key");

/** The calendars shown, by Calendar widget. */
export const calendarOptins = optinTable("calendar_optins", "calendar_key");

/** The mailboxes read, by Mail widget. */
export const mailOptins = optinTable("mail_optins", "mail_key");
