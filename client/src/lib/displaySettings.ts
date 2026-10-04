// The application's display settings ("Paramétrage" > "Affichage"), held in
// a single place: the top row reads them, and a switch flipped in the
// Settings shows there at once.
//
// Read once, when the first reader mounts; after that, it is the server's
// response to each change that is authoritative.

import { useEffect, useSyncExternalStore } from "react";
import { api } from "../api";
import type { DisplaySettings } from "@milo/shared";

let settings: DisplaySettings = { hideLogo: false };
let readItems = false;
const subscribers = new Set<() => void>();

const publish = (next: DisplaySettings) => {
  settings = next;
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
    .getDisplaySettings()
    .then(publish)
    .catch(() => {
      // Unread, the defaults stay: the logo is shown.
      readItems = false;
    });
};

export function useDisplaySettings() {
  const current = useSyncExternalStore(subscribe, () => settings);
  useEffect(read, []);

  const update = async (change: Partial<DisplaySettings>) => {
    publish(await api.updateDisplaySettings(change));
  };

  return { settings: current, update };
}
