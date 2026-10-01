// Ce que la liste des postes et les indicateurs des Assets lisent pareil.

import dayjs from "dayjs";
import type { Asset } from "@milo/shared";

/** La part occupée du disque système, en pourcentage ; « null » sans disque. */
export const diskUsage = (disk: Asset["system_disk"]): number | null =>
  disk
    ? Math.round(Math.min(100, Math.max(0, ((disk.total - disk.free) / disk.total) * 100)))
    : null;

/** Au-delà, le disque système est presque plein : la liste le dit en rouge. */
export const DISQUE_PLEIN = 85;

/** Au-delà, un poste qui ne s'est pas inventorié est sans doute éteint ou perdu. */
export const JOURS_SANS_INVENTAIRE = 30;

/** Les jours écoulés depuis le dernier inventaire. */
export const joursDepuisInventaire = (poste: Asset): number =>
  dayjs().diff(dayjs(poste.last_inventory), "day", true);

/**
 * « Windows 11 Professionnel 23H2 » : le nom, et la version s'il ne la dit pas
 * déjà. Sous macOS, le numéro de build entre parenthèses — « (23F79) » —
 * n'apprend rien à qui lit la liste : il est retiré.
 */
export const libelleOs = (os: NonNullable<Asset["os"]>): string => {
  const propre = (texte: string) =>
    os.family === "macos" ? texte.replace(/\s*\([^)]*\)/g, "").trim() : texte;
  const nom = propre(os.name);
  const version = propre(os.version);
  return version && !nom.includes(version) ? `${nom} ${version}`.trim() : nom;
};
