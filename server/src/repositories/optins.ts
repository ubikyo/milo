// Confirmation of support inboxes (lib/optin.ts): one row per list — its
// widget's list key — and per address, in lowercase. See the
// list_mailbox_optins table (db/schema.ts).

import { mutation, selection } from "../db/query.js";
import { now } from "../lib/time.js";

export interface OptinRow {
  list_key: string;
  email: string;
  code: string;
  attempts: number;
  sent_at: string;
  confirmed_at: string;
  created_at: string;
}

const de = selection<OptinRow>("SELECT * FROM list_mailbox_optins WHERE list_key = ? AND email = ?");
const all = selection<OptinRow>("SELECT * FROM list_mailbox_optins");
const create = mutation(
  "INSERT OR IGNORE INTO list_mailbox_optins (list_key, email, created_at) VALUES (?, ?, ?)",
);
const newCode = mutation(
  `UPDATE list_mailbox_optins SET code = ?, attempts = 0, sent_at = ?
   WHERE list_key = ? AND email = ?`,
);
const confirm = mutation(
  `UPDATE list_mailbox_optins SET confirmed_at = ?, code = ''
   WHERE list_key = ? AND email = ? AND confirmed_at = ''`,
);
const attempt = mutation(
  "UPDATE list_mailbox_optins SET attempts = attempts + 1 WHERE list_key = ? AND email = ?",
);
const forgetCode = mutation(
  "UPDATE list_mailbox_optins SET code = '' WHERE list_key = ? AND email = ?",
);
const forget = mutation("DELETE FROM list_mailbox_optins WHERE list_key = ? AND email = ?");

const key = (email: string) => email.trim().toLowerCase();

/** What designates a row: the list and the address, together. */
export const pair = (list: string, email: string): string => `${list}|${key(email)}`;

export const optins = {
  de: (list: string, email: string) => de.get(list, key(email)),
  /** The confirmed pairs (pair()), and since when. */
  confirmed: (): Map<string, string> =>
    new Map(
      all
        .all()
        .filter((o) => o.confirmed_at)
        .map((o) => [pair(o.list_key, o.email), o.confirmed_at]),
    ),
  /** True when the pair was unknown: it now awaits its confirmation. */
  create: (list: string, email: string): boolean => create.run(list, key(email), now()).changes > 0,
  /** The code of the last e-mail sent: the old one is no longer valid. */
  sent: (list: string, email: string, code: string): void => {
    newCode.run(code, now(), list, key(email));
  },
  attempt: (list: string, email: string): void => {
    attempt.run(list, key(email));
  },
  /** Too many attempts: the code is no longer valid, a resend is needed. */
  forgetCode: (list: string, email: string): void => {
    forgetCode.run(list, key(email));
  },
  confirm: (list: string, email: string): void => {
    confirm.run(now(), list, key(email));
  },
  /** The pairs no list mentions anymore: added again, they will be confirmed again. */
  forgetExcept: (keptKeys: Set<string>): void => {
    for (const o of all.all()) {
      if (!keptKeys.has(pair(o.list_key, o.email))) forget.run(o.list_key, o.email);
    }
  },
};
