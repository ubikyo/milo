import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { errorMessage, notifyError } from "./errors";
import type { Id, Warehouse } from "@milo/shared";

// The warehouses of the open board (shared, warehouses.ts): as the declared
// assets, the page does not read them — each Entrepôts widget reads its own,
// and re-reads when the server says they changed (App.tsx).

const EVENT = "milo:warehouses";

/** The server signalled a change of the warehouses: the widgets re-read. */
export const announceWarehouses = (): void => {
  window.dispatchEvent(new Event(EVENT));
};

/**
 * The board's warehouses — all of them, whatever their widget —, "null" while
 * they are read. "reload" reads them again, after a write from this page.
 */
export function useWarehouses(boardId: Id | undefined) {
  const [warehouses, setWarehouses] = useState<Warehouse[] | null>(null);

  const reload = useCallback(async () => {
    if (boardId === undefined) return;
    try {
      setWarehouses(await api.getWarehouses(boardId));
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

  return { warehouses, reload };
}
