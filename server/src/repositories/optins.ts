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
const tous = selection<OptinRow>("SELECT * FROM list_mailbox_optins");
const creer = mutation(
  "INSERT OR IGNORE INTO list_mailbox_optins (list_key, email, created_at) VALUES (?, ?, ?)",
);
const nouveauCode = mutation(
  `UPDATE list_mailbox_optins SET code = ?, attempts = 0, sent_at = ?
   WHERE list_key = ? AND email = ?`,
);
const confirmer = mutation(
  `UPDATE list_mailbox_optins SET confirmed_at = ?, code = ''
   WHERE list_key = ? AND email = ? AND confirmed_at = ''`,
);
const essai = mutation(
  "UPDATE list_mailbox_optins SET attempts = attempts + 1 WHERE list_key = ? AND email = ?",
);
const oublierCode = mutation(
  "UPDATE list_mailbox_optins SET code = '' WHERE list_key = ? AND email = ?",
);
const oublier = mutation("DELETE FROM list_mailbox_optins WHERE list_key = ? AND email = ?");

const cle = (email: string) => email.trim().toLowerCase();

/** Ce qui désigne une ligne : la liste et l'adresse, ensemble. */
export const paire = (liste: string, email: string): string => `${liste}|${cle(email)}`;

export const optins = {
  de: (liste: string, email: string) => de.get(liste, cle(email)),
  /** Les paires confirmées (paire()), et depuis quand. */
  confirmees: (): Map<string, string> =>
    new Map(
      tous
        .all()
        .filter((o) => o.confirmed_at)
        .map((o) => [paire(o.list_key, o.email), o.confirmed_at]),
    ),
  /** Vrai quand la paire était inconnue : elle attend désormais sa confirmation. */
  creer: (liste: string, email: string): boolean => creer.run(liste, cle(email), now()).changes > 0,
  /** Le code du dernier e-mail envoyé : l'ancien ne vaut plus. */
  envoye: (liste: string, email: string, code: string): void => {
    nouveauCode.run(code, now(), liste, cle(email));
  },
  essai: (liste: string, email: string): void => {
    essai.run(liste, cle(email));
  },
  /** Trop d'essais : le code ne vaut plus, il faut relancer. */
  oublierCode: (liste: string, email: string): void => {
    oublierCode.run(liste, cle(email));
  },
  confirmer: (liste: string, email: string): void => {
    confirmer.run(now(), liste, cle(email));
  },
  /** Les paires qu'aucune liste ne dit plus : rajoutées, elles se confirmeront de nouveau. */
  oublierSauf: (gardees: Set<string>): void => {
    for (const o of tous.all()) {
      if (!gardees.has(paire(o.list_key, o.email))) oublier.run(o.list_key, o.email);
    }
  },
};
