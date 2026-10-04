// La confirmation des boîtes de support (lib/optin.ts) : une ligne par liste
// — la clé de liste de son widget — et par adresse, en minuscules. Voir la
// table list_mailbox_optins (db/schema.ts).

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

/** Ce qui désigne une ligne : la liste et l'adresse, ensemble. */
export const pair = (list: string, email: string): string => `${list}|${key(email)}`;

export const optins = {
  de: (list: string, email: string) => de.get(list, key(email)),
  /** Les paires confirmées (paire()), et depuis quand. */
  confirmed: (): Map<string, string> =>
    new Map(
      all
        .all()
        .filter((o) => o.confirmed_at)
        .map((o) => [pair(o.list_key, o.email), o.confirmed_at]),
    ),
  /** Vrai quand la paire était inconnue : elle attend désormais sa confirmation. */
  create: (list: string, email: string): boolean => create.run(list, key(email), now()).changes > 0,
  /** Le code du dernier e-mail envoyé : l'ancien ne vaut plus. */
  sent: (list: string, email: string, code: string): void => {
    newCode.run(code, now(), list, key(email));
  },
  attempt: (list: string, email: string): void => {
    attempt.run(list, key(email));
  },
  /** Trop d'essais : le code ne vaut plus, il faut relancer. */
  forgetCode: (list: string, email: string): void => {
    forgetCode.run(list, key(email));
  },
  confirm: (list: string, email: string): void => {
    confirm.run(now(), list, key(email));
  },
  /** Les paires qu'aucune liste ne dit plus : rajoutées, elles se confirmeront de nouveau. */
  forgetExcept: (keptKeys: Set<string>): void => {
    for (const o of all.all()) {
      if (!keptKeys.has(pair(o.list_key, o.email))) forget.run(o.list_key, o.email);
    }
  },
};
