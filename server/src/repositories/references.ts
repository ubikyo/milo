// Les références « HLP-12 ». Un seul compteur les donne aux demandes du
// support, aux projets et aux cartes : une référence désigne une seule chose,
// quel que soit le mode, et se cite sans dire d'où elle vient.

import { scalar } from "../db/query.js";
import { readSetting, writeSetting } from "./settings.js";

/**
 * Le dernier numéro donné. La clé est celle d'avant le compteur commun,
 * quand seuls les tickets en portaient : elle continue d'en tenir le compte.
 */
export const COMPTEUR_REFERENCES = "support_ticket_counter";

const plusGrandeReference = scalar<{ max: number }>(
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
export const prochaineReference = (): number => {
  const numero = Math.max(readSetting(COMPTEUR_REFERENCES, 0), plusGrandeReference().max) + 1;
  writeSetting(COMPTEUR_REFERENCES, numero);
  return numero;
};
