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
let readItems = false;
const subscribers = new Set<() => void>();

const publish = (nextItems: Id[]) => {
  favoris = nextItems;
  for (const subscriber of subscribers) subscriber();
};

const subscribe = (subscriber: () => void) => {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
};

const read = () => {
  if (readItems) return;
  readItems = true;
  api
    .getFavorites()
    .then(publish)
    .catch(() => {
      // Sans favoris, les listes restent simplement dans l'ordre alphabétique.
      readItems = false;
    });
};

export function useFavorites() {
  const current = useSyncExternalStore(subscribe, () => favoris);
  useEffect(read, []);

  const toggle = async (id: Id) => {
    publish(await (current.includes(id) ? api.removeFavorite(id) : api.addFavorite(id)));
  };

  return { favoris: current, toggle };
}
