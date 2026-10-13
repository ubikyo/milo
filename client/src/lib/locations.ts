import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { errorMessage, notifyError } from "./errors";
import type { Id, Location } from "@milo/shared";

// The locations of the open board (shared, locations.ts): as the warehouses,
// the page does not read them — each Emplacements widget reads its own, and
// re-reads when the server says they changed (App.tsx).

const EVENT = "milo:locations";

/** The server signalled a change of the locations: the widgets re-read. */
export const announceLocations = (): void => {
  window.dispatchEvent(new Event(EVENT));
};

/**
 * The board's locations — all of them, whatever their widget —, "null" while
 * they are read. "reload" reads them again, after a write from this page.
 */
export function useLocations(boardId: Id | undefined) {
  const [locations, setLocations] = useState<Location[] | null>(null);

  const reload = useCallback(async () => {
    if (boardId === undefined) return;
    try {
      setLocations(await api.getLocations(boardId));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [boardId]);

  useEffect(() => {
    void reload();
    const listener = () => void reload();
    window.addEventListener(EVENT, listener);
    return () => window.removeEventListener(EVENT, listener);
  }, [reload]);

  return { locations, reload };
}
