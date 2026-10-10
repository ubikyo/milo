import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { errorMessage, notifyError } from "./errors";
import type { Contact, Id } from "@milo/shared";

// The contacts of the open board (shared, contacts.ts): as the declared
// assets, the page does not read them — each Contact widget reads its own,
// and re-reads when the server says they changed (App.tsx).

const EVENT = "milo:contacts";

/** The server signalled a change of the contacts: the widgets re-read. */
export const announceContacts = (): void => {
  window.dispatchEvent(new Event(EVENT));
};

/**
 * The board's contacts — all of them, whatever their widget: a company picks
 * its people among them —, "null" while they are read. "reload" reads them
 * again, after a write from this page.
 */
export function useContacts(boardId: Id | undefined) {
  const [contacts, setContacts] = useState<Contact[] | null>(null);

  const reload = useCallback(async () => {
    if (boardId === undefined) return;
    try {
      setContacts(await api.getContacts(boardId));
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

  return { contacts, reload };
}
