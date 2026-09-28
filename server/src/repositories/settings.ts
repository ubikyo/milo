// Les réglages de l'application : ce qui ne tient à aucun compte en
// particulier — la messagerie sortante, la trace de la dernière restauration.
//
// Une table clé / valeur, la valeur en JSON. Les réglages sont peu nombreux,
// lus une fois par requête qui en a besoin, et leur forme change avec ce qu'on
// y ajoute : une colonne par champ demanderait une migration à chaque fois.

import { mutation, selection } from "../db/query.js";
import type { SettingRow } from "../db/rows.js";

const lire = selection<SettingRow>("SELECT * FROM settings WHERE key = ?");
const ecrire = mutation(
  `INSERT INTO settings (key, value) VALUES (?, ?)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
);

/**
 * Le réglage, ou la valeur donnée s'il n'a jamais été écrit. Un JSON abîmé —
 * une base modifiée à la main, une restauration d'une version plus ancienne —
 * est traité comme une absence : l'application repart du défaut plutôt que de
 * refuser de démarrer.
 */
export const readSetting = <T>(key: string, defaut: T): T => {
  const ligne = lire.get(key);
  if (!ligne) return defaut;
  try {
    return JSON.parse(ligne.value) as T;
  } catch {
    return defaut;
  }
};

export const writeSetting = (key: string, valeur: unknown): void => {
  ecrire.run(key, JSON.stringify(valeur));
};
