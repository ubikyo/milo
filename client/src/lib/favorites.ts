// The signed-in person's favorite actors, held in a single place:
// every list of actors in the application reads them, and a star checked in
// one shows at once in all the others.
//
// Read once, when the first selector mounts; after that, it is the server's
// response to each gesture that is authoritative.

import { useEffect, useSyncExternalStore } from "react";
import { api } from "../api";
import type { Id } from "@milo/shared";

let favorites: Id[] = [];
let readItems = false;
const subscribers = new Set<() => void>();

const publish = (nextItems: Id[]) => {
  favorites = nextItems;
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
      // Without favorites, the lists simply stay in alphabetical order.
      readItems = false;
    });
};

export function useFavorites() {
  const current = useSyncExternalStore(subscribe, () => favorites);
  useEffect(read, []);

  const toggle = async (id: Id) => {
    publish(await (current.includes(id) ? api.removeFavorite(id) : api.addFavorite(id)));
  };

  return { favorites: current, toggle };
}
