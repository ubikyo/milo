import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { errorMessage, notifyError } from "./errors";
import { SUPPORT_REPLY_VARIABLES, fillSupportTemplate } from "@milo/shared";
import type { Id, Order, SupportPerson } from "@milo/shared";

// The orders of the open board (shared, orders.ts): as the declared
// assets, the page does not read them — each Commandes widget reads its own,
// and re-reads when the server says they changed (App.tsx).

const EVENT = "milo:orders";

/** The server signalled a change of the orders: the widgets re-read. */
export const announceOrders = (): void => {
  window.dispatchEvent(new Event(EVENT));
};

/**
 * The board's orders — all of them, whatever their widget —, "null" while
 * they are read. "reload" reads them again, after a write from this page.
 */
export function useOrders(boardId: Id | undefined) {
  const [orders, setOrders] = useState<Order[] | null>(null);

  const reload = useCallback(async () => {
    if (boardId === undefined) return;
    try {
      setOrders(await api.getOrders(boardId));
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

  return { orders, reload };
}

/** The signed-in person, read once: the editors fill their "{{user.…}}" with it. */
let writer: Promise<SupportPerson | null> | null = null;

/**
 * A content with the writer's variables filled — "{{user.full_name}}"…: the
 * editor shows the signature as it will go. The others — the supplier's
 * contact — are filled for each recipient on sending.
 */
export const useWriterFill = (): ((html: string) => string) => {
  const [person, setPerson] = useState<SupportPerson | null>(null);
  useEffect(() => {
    writer ??= api.getOrderVariables().then(
      (r) => r.user,
      () => null,
    );
    let current = true;
    void writer.then((p) => current && setPerson(p));
    return () => {
      current = false;
    };
  }, []);
  return useCallback(
    (html: string) => {
      if (!person) return html;
      const values = Object.fromEntries(
        SUPPORT_REPLY_VARIABLES.filter((v) => v.key.startsWith("user.")).map((v) => [
          v.key,
          person[v.key.slice("user.".length) as keyof SupportPerson] ?? "",
        ]),
      );
      return fillSupportTemplate(html, values);
    },
    [person],
  );
};
