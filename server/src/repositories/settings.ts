// Les réglages de l'application : ce qui ne tient à aucun compte en
// particulier — la messagerie sortante, la trace de la dernière restauration.
//
// Une table clé / valeur, la valeur en JSON. Les réglages sont peu nombreux,
// lus une fois par requête qui en a besoin, et leur forme change avec ce qu'on
// y ajoute : une colonne par champ demanderait une migration à chaque fois.

import { mutation, selection } from "../db/query.js";
import type { SettingRow } from "../db/rows.js";

const read = selection<SettingRow>("SELECT * FROM settings WHERE key = ?");
const write = mutation(
  `INSERT INTO settings (key, value) VALUES (?, ?)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
);

/**
 * Le réglage, ou la valeur donnée s'il n'a jamais été écrit. Un JSON abîmé —
 * une base modifiée à la main, une restauration d'une version plus ancienne —
 * est traité comme une absence : l'application repart du défaut plutôt que de
 * refuser de démarrer.
 */
export const readSetting = <T>(key: string, defaultValue: T): T => {
  const row = read.get(key);
  if (!row) return defaultValue;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return defaultValue;
  }
};

export const writeSetting = (key: string, value: unknown): void => {
  write.run(key, JSON.stringify(value));
};
