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

export interface CopiedWidget {
  type: string;
  config: Record<string, unknown>;
  /** Son nom, pour « Coller … » dans le menu des sections. */
  label: string;
}

const KEY = "milo.presse-papiers.widget";

const read = (): CopiedWidget | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const readValue = JSON.parse(raw) as Partial<CopiedWidget>;
    return typeof readValue.type === "string" && readValue.config && typeof readValue.config === "object"
      ? { type: readValue.type, config: readValue.config, label: String(readValue.label ?? readValue.type) }
      : null;
  } catch {
    return null;
  }
};

let current: CopiedWidget | null = read();
const subscribers = new Set<() => void>();
const notify = () => subscribers.forEach((f) => f());

/** Copier un widget : il remplace le précédent. */
export const copyWidget = (copy: CopiedWidget): void => {
  current = copy;
  try {
    localStorage.setItem(KEY, JSON.stringify(copy));
  } catch {
    // Stockage refusé : la copie reste en mémoire, le temps de la page.
  }
  notify();
};

// Une copie faite dans un autre onglet arrive ici aussi.
window.addEventListener("storage", (e) => {
  if (e.key !== KEY) return;
  current = read();
  notify();
});

const subscribe = (f: () => void) => {
  subscribers.add(f);
  return () => subscribers.delete(f);
};

/** Le widget copié, ou « null ». */
export const useCopiedWidget = (): CopiedWidget | null =>
  useSyncExternalStore(subscribe, () => current);
