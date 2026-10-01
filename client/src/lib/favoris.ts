// Les acteurs favoris de la personne connectée, tenus en un seul endroit :
// chaque liste d'acteurs de l'application les lit, et une étoile cochée dans
// l'une se voit aussitôt dans toutes les autres.
//
// Lus une fois, au premier sélecteur monté ; ensuite, c'est la réponse du
// serveur à chaque geste qui fait foi.

import { useEffect, useSyncExternalStore } from "react";
import { api } from "../api";
import type { Id } from "@milo/shared";

let favoris: Id[] = [];
let lus = false;
const abonnes = new Set<() => void>();

const publier = (suivants: Id[]) => {
  favoris = suivants;
  for (const abonne of abonnes) abonne();
};

const s_abonner = (abonne: () => void) => {
  abonnes.add(abonne);
  return () => abonnes.delete(abonne);
};

const lire = () => {
  if (lus) return;
  lus = true;
  api
    .getFavorites()
    .then(publier)
    .catch(() => {
      // Sans favoris, les listes restent simplement dans l'ordre alphabétique.
      lus = false;
    });
};

export function useFavoris() {
  const actuels = useSyncExternalStore(s_abonner, () => favoris);
  useEffect(lire, []);

  const basculer = async (id: Id) => {
    publier(await (actuels.includes(id) ? api.removeFavorite(id) : api.addFavorite(id)));
  };

  return { favoris: actuels, basculer };
}
