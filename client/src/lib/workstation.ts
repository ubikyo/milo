// Ce que la liste des postes et les indicateurs des Assets lisent pareil.

import dayjs from "dayjs";
import type { Asset } from "@milo/shared";

/** La part occupée du disque système, en pourcentage ; « null » sans disque. */
export const diskUsage = (disk: Asset["system_disk"]): number | null =>
  disk
    ? Math.round(Math.min(100, Math.max(0, ((disk.total - disk.free) / disk.total) * 100)))
    : null;

/** Au-delà, le disque système est presque plein : la liste le dit en rouge. */
export const DISK_FULL = 85;

/** Au-delà, un poste qui ne s'est pas inventorié est sans doute éteint ou perdu. */
export const DAYS_WITHOUT_INVENTORY = 30;

/** Les jours écoulés depuis le dernier inventaire. */
export const daysSinceInventory = (workstation: Asset): number =>
  dayjs().diff(dayjs(workstation.last_inventory), "day", true);

/**
 * « Windows 11 Professionnel 23H2 » : le nom, et la version s'il ne la dit pas
 * déjà. Sous macOS, le numéro de build entre parenthèses — « (23F79) » —
 * n'apprend rien à qui lit la liste : il est retiré.
 */
export const osLabel = (os: NonNullable<Asset["os"]>): string => {
  const clean = (text: string) =>
    os.family === "macos" ? text.replace(/\s*\([^)]*\)/g, "").trim() : text;
  const name = clean(os.name);
  const version = clean(os.version);
  const label = version && !name.includes(version) ? `${name} ${version}`.trim() : name;
  // L'édition « Entreprise » (ou « Enterprise ») va de soi sur un parc
  // d'entreprise : le nom tient mieux sans.
  return label.replace(/\s*\b(Entreprise|Enterprise)\b/gi, "").trim();
};
