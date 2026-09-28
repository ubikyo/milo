// L'échéance d'une carte : où elle en est, et comment elle s'écrit.
//
// La règle vit ici et non dans les deux écrans qui la montrent — le tiroir
// d'une carte et la carte sur le tableau. Sans cela, « bientôt » aurait fini
// par ne pas vouloir dire la même chose de part et d'autre.

import dayjs from "dayjs";

/**
 * Trois états, et trois seulement :
 *
 * - `retard` : l'heure est passée. C'est le seul qui soit un fait, pas une
 *   prévision — d'où le rouge.
 * - `bientot` : elle tombe dans les trois jours. Un avertissement.
 * - `aucun` : elle est assez loin pour ne rien signaler.
 */
export type EtatEcheance = "retard" | "bientot" | "aucun";

/** Le délai en deçà duquel une échéance est « bientôt ». */
export const JOURS_AVANT_ECHEANCE = 3;

/**
 * Où en est cette échéance. `maintenant` se passe pour pouvoir éprouver la
 * règle sans dépendre de l'heure qu'il est.
 *
 * La comparaison porte sur les jours et non sur les instants : une carte à
 * rendre aujourd'hui n'est pas « en retard » à midi parce que son heure a été
 * laissée à minuit. C'est bien « la date du jour » qui tranche, et le retard
 * ne commence que le lendemain.
 *
 * Une échéance dépassée est « en retard », pas « bientôt » : le retard est un
 * constat, il prime sur l'avertissement.
 */
export const etatEcheance = (
  due: string | null | undefined,
  maintenant: Date = new Date(),
): EtatEcheance => {
  if (!due) return "aucun";
  const echeance = dayjs(due);
  if (!echeance.isValid()) return "aucun";

  const jours = echeance.startOf("day").diff(dayjs(maintenant).startOf("day"), "day");
  if (jours < 0) return "retard";
  return jours <= JOURS_AVANT_ECHEANCE ? "bientot" : "aucun";
};

/** Ce que dit la bulle : « En retard », « Bientôt », ou rien. */
export const MOT_ECHEANCE: Record<EtatEcheance, string> = {
  retard: "En retard",
  bientot: "Bientôt",
  aucun: "",
};

/**
 * La couleur de la bulle. Le rouge du retard est celui des suppressions et des
 * erreurs — c'est le même signal ; l'orange de « bientôt » est celui de
 * l'avancement à mi-chemin (themes/colors.ts).
 */
export const COULEUR_ECHEANCE: Record<EtatEcheance, string | undefined> = {
  retard: "red",
  bientot: "orange",
  aucun: undefined,
};

// Le serveur refuse une date qu'il ne comprend pas ; une valeur illisible ne
// devrait donc jamais arriver ici. Si l'une passait tout de même, mieux vaut
// n'afficher rien qu'un « Invalid Date » au milieu d'une carte.
const formate = (due: string | null | undefined, motif: string): string => {
  const date = dayjs(due ?? "");
  return due && date.isValid() ? date.locale("fr").format(motif) : "";
};

/** Court, pour une carte du tableau : « 5 oct. ». */
export const dateCourte = (due: string | null | undefined): string => formate(due, "D MMM");

/** Entier, pour la fiche : « 5 octobre 2026 à 17:00 ». */
export const dateLongue = (due: string | null | undefined): string =>
  formate(due, "D MMMM YYYY [à] HH:mm");
