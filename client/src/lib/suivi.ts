// Le suivi, côté client : ce qui s'ouvre depuis une adresse, et ce qui
// s'affiche quand un élément suivi change.
//
// L'application n'a pas de routeur : un seul écran, des tiroirs, et l'état
// dans React. L'adresse ne sert donc pas à naviguer — elle sert à pouvoir
// désigner un élément de l'extérieur, depuis un e-mail ou un message. Elle est
// tenue à jour pour que la page rechargée retrouve ce qui était ouvert.

import type { Id, LienKind } from "@milo/shared";
import { lienElement } from "@milo/shared";

export interface Cible {
  /** Pour « access », l'identifiant est celui de la catégorie. */
  kind: LienKind;
  id: Id;
}

const NOMS: Record<string, LienKind> = {
  projet: "project",
  carte: "card",
  demande: "support",
  poste: "asset",
  acces: "access",
};

/** Ce que l'adresse courante désigne, s'il y a lieu. */
export const cibleDeLAdresse = (): Cible | null => {
  const parametres = new URLSearchParams(window.location.search);

  for (const [nom, kind] of Object.entries(NOMS)) {
    const brut = parametres.get(nom);
    if (brut === null) continue;
    const id = Number(brut);
    if (Number.isInteger(id) && id > 0) return { kind, id };
  }
  return null;
};

/**
 * Écrit l'élément ouvert dans l'adresse, ou l'en retire. `replaceState` et non
 * `pushState` : ouvrir un tiroir n'est pas une navigation, et la flèche
 * « retour » du navigateur ne doit pas se mettre à défaire des ouvertures de
 * fiches.
 */
export const noterDansLAdresse = (cible: Cible | null): void => {
  const adresse = cible
    ? `${window.location.pathname}${lienElement(cible.kind, cible.id)}`
    : window.location.pathname;

  if (adresse !== window.location.pathname + window.location.search) {
    window.history.replaceState(null, "", adresse);
  }
};
