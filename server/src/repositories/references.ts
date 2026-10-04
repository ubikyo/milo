// Les références « HLP-12 ». Un seul compteur les donne aux demandes du
// support, aux projets et aux cartes : une référence désigne une seule chose,
// quel que soit le mode, et se cite sans dire d'où elle vient.

import { scalar } from "../db/query.js";
import { readSetting, writeSetting } from "./settings.js";

/**
 * Le dernier numéro donné. La clé est celle d'avant le compteur commun,
 * quand seuls les tickets en portaient : elle continue d'en tenir le compte.
 */
export const REFERENCE_COUNTER = "support_ticket_counter";

const largestReference = scalar<{ max: number }>(
  `SELECT MAX(
     (SELECT COALESCE(MAX(number), 0) FROM support_requests),
     (SELECT COALESCE(MAX(number), 0) FROM projects),
     (SELECT COALESCE(MAX(number), 0) FROM task_cards)
   ) AS max`,
);

/**
 * La prochaine référence, et le compteur avancé d'autant. La plus grande en
 * base compte aussi : une sauvegarde restaurée, ou un compteur perdu, ne fait
 * jamais donner deux fois la même.
 *
 * À appeler dans la transaction qui crée l'élément : si elle échoue, le
 * numéro n'est pas consommé.
 */
export const nextReference = (): number => {
  const phoneNumber = Math.max(readSetting(REFERENCE_COUNTER, 0), largestReference().max) + 1;
  writeSetting(REFERENCE_COUNTER, phoneNumber);
  return phoneNumber;
};
