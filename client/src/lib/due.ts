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
export type DueState = "late" | "soon" | "none";

/** Le délai en deçà duquel une échéance est « bientôt ». */
export const DAYS_BEFORE_DUE = 3;

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
export const dueState = (
  due: string | null | undefined,
  currentTime: Date = new Date(),
): DueState => {
  if (!due) return "none";
  const dueDay = dayjs(due);
  if (!dueDay.isValid()) return "none";

  const days = dueDay.startOf("day").diff(dayjs(currentTime).startOf("day"), "day");
  if (days < 0) return "late";
  return days <= DAYS_BEFORE_DUE ? "soon" : "none";
};

/** Ce que dit la bulle : « En retard », « Bientôt », ou rien. */
export const DUE_WORD: Record<DueState, string> = {
  late: "En retard",
  soon: "Bientôt",
  none: "",
};

/**
 * La couleur de la bulle. Le rouge du retard est celui des suppressions et des
 * erreurs — c'est le même signal ; l'orange de « bientôt » est celui de
 * l'avancement à mi-chemin (themes/colors.ts).
 */
export const DUE_COLOR: Record<DueState, string | undefined> = {
  late: "red",
  soon: "orange",
  none: undefined,
};

// Le serveur refuse une date qu'il ne comprend pas ; une valeur illisible ne
// devrait donc jamais arriver ici. Si l'une passait tout de même, mieux vaut
// n'afficher rien qu'un « Invalid Date » au milieu d'une carte.
const formatDue = (due: string | null | undefined, pattern: string): string => {
  const date = dayjs(due ?? "");
  return due && date.isValid() ? date.locale("fr").format(pattern) : "";
};

/** Court, pour une carte du tableau : « 5 oct. ». */
export const shortDate = (due: string | null | undefined): string => formatDue(due, "D MMM");

/**
 * Une échéance sans heure. L'heure est facultative : laissée vide, le
 * calendrier pose la date à minuit, et c'est minuit — à l'heure locale — qui
 * vaut « pas d'heure ». Une échéance réellement à minuit se lit donc comme la
 * journée entière, ce qui revient au même : la règle des états compare les
 * jours, pas les heures.
 */
export const withoutTime = (due: string | null | undefined): boolean => {
  const date = dayjs(due ?? "");
  return date.isValid() && date.hour() === 0 && date.minute() === 0 && date.second() === 0;
};
