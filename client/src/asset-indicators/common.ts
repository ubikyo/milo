// Ce que les widgets des Assets partagent : les règles qui disent qu'un poste
// demande de l'attention. Le titre et le champ « Nom » sont ceux du Support.

import { DISK_FULL, diskUsage, daysSinceInventory, DAYS_WITHOUT_INVENTORY } from "../lib/workstation";
import type { Asset } from "@milo/shared";

export { NameField, NAME, Nothing, TitreIndicateur, IndicatorValue } from "../indicators/common";

/** Un volume système dont on sait qu'il n'est pas chiffré. */
export const notEncrypted = (a: Asset): boolean => a.system_disk_encrypted === false;

/** Un poste Windows sans protection, ou dont la protection est désactivée. */
export const unprotected = (a: Asset): boolean =>
  a.protection.state === "none" || a.protection.state === "inactive";

export const diskFull = (a: Asset): boolean => (diskUsage(a.system_disk) ?? 0) > DISK_FULL;

export const silent = (a: Asset): boolean => daysSinceInventory(a) > DAYS_WITHOUT_INVENTORY;

/**
 * Windows 10 n'a plus de mises à jour de sécurité depuis le 14 octobre 2025 :
 * ses postes sont à migrer. Le noyau dit « 10.0 » pour les deux, c'est le nom
 * qui les distingue.
 */
export const windows10 = (a: Asset): boolean =>
  a.os?.family === "windows" && /windows\s*10\b/i.test(a.os.name);
