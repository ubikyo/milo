// The confirmation state of a requests list's inboxes (server,
// lib/optin.ts) — or of the people a Calendar widget names
// (lib/calendar-optin.ts) —, read for its addresses and re-read regularly: an
// address can be confirmed from another screen at any time. The list's drawer
// and the list itself read it; a confirmation made in Milo
// notifies the other readers (signalConfirmation) without waiting.

import { useEffect, useState } from "react";
import { api } from "../api";
import type { MailboxOptinState } from "@milo/shared";

/** The time between two reads. */
const RELOAD_INTERVAL = 10_000;

const EVENT = "milo:confirmations";

/**
 * The last states read, by list and addresses: a widget that comes back —
 * another tab, then this one — finds them at once, without going through
 * a state it does not have.
 */
const remembered = new Map<string, Map<string, MailboxOptinState>>();

/** An address has just been confirmed: everyone re-reads. */
export const signalConfirmation = (): void => {
  window.dispatchEvent(new Event(EVENT));
};

/** Whose confirmations: a request list's inboxes, a calendar's or a Mail widget's people. */
export type ConfirmationScope = "mailbox" | "calendar" | "mail";

const readers = {
  mailbox: api.getMailboxOptins,
  calendar: api.getCalendarOptins,
  mail: api.getMailOptins,
};

/**
 * The states of the addresses of list "list" — or of calendar "list", for the
 * "calendar" scope —, by lowercase address.
 * "isRead" stays false until the first response: nothing is concluded before.
 * Without a list — a widget not yet saved —, there is nothing to read.
 */
export const useConfirmations = (
  list: string,
  emails: string[],
  scope: ConfirmationScope = "mailbox",
) => {
  const key = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))]
    .sort()
    .join(",");
  const memo = `${scope}|${list}|${key}`;
  const [states, setStates] = useState<Map<string, MailboxOptinState>>(
    () => remembered.get(memo) ?? new Map(),
  );
  const [isRead, setLoaded] = useState(() => !key || !list || remembered.has(memo));

  useEffect(() => {
    if (!key || !list) {
      setStates(new Map());
      setLoaded(true);
      return;
    }
    const known = remembered.get(memo);
    setStates(known ?? new Map());
    setLoaded(Boolean(known));
    let active = true;
    const read = () =>
      readers[scope](list, key.split(","))
        .then((response) => {
          const received = new Map(response.map((e) => [e.email.toLowerCase(), e]));
          remembered.set(memo, received);
          if (!active) return;
          setStates(received);
          setLoaded(true);
        })
        .catch(() => {
          /* without the states, nothing is concluded: the next read will tell */
        });
    // Right away if nothing is known; otherwise, once the input has settled.
    const delay = setTimeout(read, known ? 300 : 0);
    const interval = setInterval(read, RELOAD_INTERVAL);
    window.addEventListener(EVENT, read);
    return () => {
      active = false;
      clearTimeout(delay);
      clearInterval(interval);
      window.removeEventListener(EVENT, read);
    };
  }, [key, list, memo, scope]);

  const confirmed = (email: string) =>
    states.get(email.trim().toLowerCase())?.status === "confirmed";
  return { states, isRead, confirmed };
};
