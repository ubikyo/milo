// L'état de confirmation des boîtes d'une liste de demandes (server,
// lib/optin.ts), lu pour ses adresses et relu régulièrement : une adresse
// peut être confirmée depuis un autre écran à tout moment. Le tiroir de la
// liste et la liste elle-même le lisent ; une confirmation faite dans Milo
// prévient les autres lecteurs (signalerConfirmation) sans attendre.

import { useEffect, useState } from "react";
import { api } from "../api";
import type { MailboxOptinState } from "@milo/shared";

/** Le temps entre deux lectures. */
const RELOAD_INTERVAL = 10_000;

const EVENT = "milo:confirmations";

/**
 * Les derniers états lus, par liste et adresses : un widget qui revient —
 * un autre onglet, puis celui-ci — les retrouve aussitôt, sans repasser par
 * un état qu'il n'a pas.
 */
const remembered = new Map<string, Map<string, MailboxOptinState>>();

/** Une adresse vient d'être confirmée : chacun relit. */
export const signalConfirmation = (): void => {
  window.dispatchEvent(new Event(EVENT));
};

/**
 * Les états des adresses de la liste « liste », par adresse en minuscules.
 * « lus » reste faux jusqu'à la première réponse : rien ne se conclut avant.
 * Sans liste — un widget pas encore enregistré —, il n'y a rien à lire.
 */
export const useConfirmations = (list: string, emails: string[]) => {
  const key = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))]
    .sort()
    .join(",");
  const memo = `${list}|${key}`;
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
      api
        .getMailboxOptins(list, key.split(","))
        .then((response) => {
          const received = new Map(response.map((e) => [e.email.toLowerCase(), e]));
          remembered.set(memo, received);
          if (!active) return;
          setStates(received);
          setLoaded(true);
        })
        .catch(() => {
          /* sans les états, rien ne se conclut : la prochaine lecture dira */
        });
    // Tout de suite si rien n'est connu ; sinon, le temps que la saisie se pose.
    const delay = setTimeout(read, known ? 300 : 0);
    const interval = setInterval(read, RELOAD_INTERVAL);
    window.addEventListener(EVENT, read);
    return () => {
      active = false;
      clearTimeout(delay);
      clearInterval(interval);
      window.removeEventListener(EVENT, read);
    };
  }, [key, list, memo]);

  const confirmed = (email: string) =>
    states.get(email.trim().toLowerCase())?.status === "confirmed";
  return { states, isRead, confirmed };
};
