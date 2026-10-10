import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { errorMessage, notifyError } from "./errors";
import type { Id, Product } from "@milo/shared";

// The products of the open board (shared, products.ts): as the declared
// assets, the page does not read them — each Produits widget reads its own,
// and re-reads when the server says they changed (App.tsx).

const EVENT = "milo:products";

/** The server signalled a change of the products: the widgets re-read. */
export const announceProducts = (): void => {
  window.dispatchEvent(new Event(EVENT));
};

/**
 * The board's products — all of them, whatever their widget —, "null" while
 * they are read. "reload" reads them again, after a write from this page.
 */
export function useProducts(boardId: Id | undefined) {
  const [products, setProducts] = useState<Product[] | null>(null);

  const reload = useCallback(async () => {
    if (boardId === undefined) return;
    try {
      setProducts(await api.getProducts(boardId));
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

  return { products, reload };
}
