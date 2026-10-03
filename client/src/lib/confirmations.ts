// L'état de confirmation des boîtes d'une liste de demandes (server,
// lib/optin.ts), lu pour ses adresses et relu régulièrement : une adresse
// peut être confirmée depuis un autre écran à tout moment. Le tiroir de la
// liste et la liste elle-même le lisent ; une confirmation faite dans Milo
// prévient les autres lecteurs (signalerConfirmation) sans attendre.

import { useEffect, useState } from "react";
import { api } from "../api";
import type { MailboxOptinState } from "@milo/shared";

/** Le temps entre deux lectures. */
const RELECTURE = 10_000;

const EVENEMENT = "milo:confirmations";

/**
 * Les derniers états lus, par liste et adresses : un widget qui revient —
 * un autre onglet, puis celui-ci — les retrouve aussitôt, sans repasser par
 * un état qu'il n'a pas.
 */
const memoire = new Map<string, Map<string, MailboxOptinState>>();

/** Une adresse vient d'être confirmée : chacun relit. */
export const signalerConfirmation = (): void => {
  window.dispatchEvent(new Event(EVENEMENT));
};

/**
 * Les états des adresses de la liste « liste », par adresse en minuscules.
 * « lus » reste faux jusqu'à la première réponse : rien ne se conclut avant.
 * Sans liste — un widget pas encore enregistré —, il n'y a rien à lire.
 */
export const useConfirmations = (liste: string, emails: string[]) => {
  const cle = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))]
    .sort()
    .join(",");
  const memo = `${liste}|${cle}`;
  const [etats, setEtats] = useState<Map<string, MailboxOptinState>>(
    () => memoire.get(memo) ?? new Map(),
  );
  const [lus, setLus] = useState(() => !cle || !liste || memoire.has(memo));

  useEffect(() => {
    if (!cle || !liste) {
      setEtats(new Map());
      setLus(true);
      return;
    }
    const connus = memoire.get(memo);
    setEtats(connus ?? new Map());
    setLus(Boolean(connus));
    let actif = true;
    const lire = () =>
      api
        .getMailboxOptins(liste, cle.split(","))
        .then((reponse) => {
          const recus = new Map(reponse.map((e) => [e.email.toLowerCase(), e]));
          memoire.set(memo, recus);
          if (!actif) return;
          setEtats(recus);
          setLus(true);
        })
        .catch(() => {
          /* sans les états, rien ne se conclut : la prochaine lecture dira */
        });
    // Tout de suite si rien n'est connu ; sinon, le temps que la saisie se pose.
    const delai = setTimeout(lire, connus ? 300 : 0);
    const intervalle = setInterval(lire, RELECTURE);
    window.addEventListener(EVENEMENT, lire);
    return () => {
      actif = false;
      clearTimeout(delai);
      clearInterval(intervalle);
      window.removeEventListener(EVENEMENT, lire);
    };
  }, [cle, liste, memo]);

  const confirmee = (email: string) =>
    etats.get(email.trim().toLowerCase())?.status === "confirmed";
  return { etats, lus, confirmee };
};
