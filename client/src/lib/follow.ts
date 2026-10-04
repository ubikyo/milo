// Le suivi, côté client : ce qui s'ouvre depuis une adresse, et ce qui
// s'affiche quand un élément suivi change.
//
// L'application n'a pas de routeur : un seul écran, des tiroirs, et l'état
// dans React. L'adresse ne sert donc pas à naviguer — elle sert à pouvoir
// désigner un élément de l'extérieur, depuis un e-mail ou un message. Elle est
// tenue à jour pour que la page rechargée retrouve ce qui était ouvert.

import type { Id, LinkTargetKind } from "@milo/shared";
import { itemLink } from "@milo/shared";

export interface Target {
  /** Pour « access », l'identifiant est celui du tableau. */
  kind: LinkTargetKind;
  id: Id;
}

const NAMES: Record<string, LinkTargetKind> = {
  project: "project",
  card: "card",
  request: "support",
  workstation: "asset",
  access: "access",
};

/** Ce que l'adresse courante désigne, s'il y a lieu. */
export const addressTarget = (): Target | null => {
  const searchParams = new URLSearchParams(window.location.search);

  for (const [name, kind] of Object.entries(NAMES)) {
    const raw = searchParams.get(name);
    if (raw === null) continue;
    const id = Number(raw);
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
export const noteInAddress = (target: Target | null): void => {
  const address = target
    ? `${window.location.pathname}${itemLink(target.kind, target.id)}`
    : window.location.pathname;

  if (address !== window.location.pathname + window.location.search) {
    window.history.replaceState(null, "", address);
  }
};
