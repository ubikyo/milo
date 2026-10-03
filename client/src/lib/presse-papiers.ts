// Le presse-papiers des widgets : le widget copié par « Copier » (menu d'un
// widget), en attente d'être collé dans une section — de la même vue ou d'une
// autre, d'un autre tableau. Il ne garde que de quoi le recréer : son type et
// sa configuration ; coller, c'est l'ajouter là, comme depuis le tiroir des
// widgets.
//
// Il vit dans le navigateur (localStorage) : il survit au changement de vue
// et au rechargement, et passe d'un onglet à l'autre. Un stockage refusé — une
// fenêtre privée — le laisse en mémoire seulement.

import { useSyncExternalStore } from "react";

export interface WidgetCopie {
  type: string;
  config: Record<string, unknown>;
  /** Son nom, pour « Coller … » dans le menu des sections. */
  label: string;
}

const CLE = "milo.presse-papiers.widget";

const lire = (): WidgetCopie | null => {
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return null;
    const lu = JSON.parse(brut) as Partial<WidgetCopie>;
    return typeof lu.type === "string" && lu.config && typeof lu.config === "object"
      ? { type: lu.type, config: lu.config, label: String(lu.label ?? lu.type) }
      : null;
  } catch {
    return null;
  }
};

let courant: WidgetCopie | null = lire();
const abonnes = new Set<() => void>();
const prevenir = () => abonnes.forEach((f) => f());

/** Copier un widget : il remplace le précédent. */
export const copierWidget = (copie: WidgetCopie): void => {
  courant = copie;
  try {
    localStorage.setItem(CLE, JSON.stringify(copie));
  } catch {
    // Stockage refusé : la copie reste en mémoire, le temps de la page.
  }
  prevenir();
};

// Une copie faite dans un autre onglet arrive ici aussi.
window.addEventListener("storage", (e) => {
  if (e.key !== CLE) return;
  courant = lire();
  prevenir();
});

const abonner = (f: () => void) => {
  abonnes.add(f);
  return () => abonnes.delete(f);
};

/** Le widget copié, ou « null ». */
export const useWidgetCopie = (): WidgetCopie | null =>
  useSyncExternalStore(abonner, () => courant);
