// Ce que les widgets des Assets partagent : les règles qui disent qu'un poste
// demande de l'attention. Le titre et le champ « Nom » sont ceux du Support.

import { DISQUE_PLEIN, diskUsage, joursDepuisInventaire, JOURS_SANS_INVENTAIRE } from "../lib/poste";
import type { Asset } from "@milo/shared";

export { ChampNom, NOM, Rien, TitreIndicateur, ValeurIndicateur } from "../indicators/commun";

/** Un volume système dont on sait qu'il n'est pas chiffré. */
export const nonChiffre = (a: Asset): boolean => a.system_disk_encrypted === false;

/** Un poste Windows sans protection, ou dont la protection est désactivée. */
export const sansProtection = (a: Asset): boolean =>
  a.protection.state === "none" || a.protection.state === "inactive";

export const disquePlein = (a: Asset): boolean => (diskUsage(a.system_disk) ?? 0) > DISQUE_PLEIN;

export const silencieux = (a: Asset): boolean => joursDepuisInventaire(a) > JOURS_SANS_INVENTAIRE;

/**
 * Windows 10 n'a plus de mises à jour de sécurité depuis le 14 octobre 2025 :
 * ses postes sont à migrer. Le noyau dit « 10.0 » pour les deux, c'est le nom
 * qui les distingue.
 */
export const windows10 = (a: Asset): boolean =>
  a.os?.family === "windows" && /windows\s*10\b/i.test(a.os.name);
