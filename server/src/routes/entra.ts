// L'onglet Entra du Paramétrage : l'application, le groupe des
// administrateurs, l'adresse d'expédition, et les vérifications — un message
// d'essai, l'accès aux boîtes de support que les listes de demandes reçoivent.

import { Router } from "express";
import type { MailboxCheck } from "@milo/shared";
import {
  sendingAddress,
  connectEntra,
  entraState,
  readMessages,
  updateEntra,
  publicEntraSettings,
} from "../lib/entra.js";
import { badRequest, requireText } from "../lib/http.js";
import { sendTest } from "../lib/mail.js";
import { configuredMailboxes } from "../repositories/inboxes.js";

export const entraRoutes = Router();

entraRoutes.get("/", (_req, res) => {
  res.json(publicEntraSettings());
});

entraRoutes.put("/", (req, res) => {
  updateEntra(req.body ?? {});
  res.json(publicEntraSettings());
});

// L'état de la connexion de Milo à Entra, et les deux actions qui le changent.
entraRoutes.get("/status", (_req, res, next) => {
  entraState()
    .then((state) => res.json(state))
    .catch(next);
});

entraRoutes.post("/connect", (_req, res, next) => {
  connectEntra(true);
  entraState()
    .then((state) => res.json(state))
    .catch(next);
});

entraRoutes.post("/disconnect", (_req, res, next) => {
  connectEntra(false);
  entraState()
    .then((state) => res.json(state))
    .catch(next);
});

entraRoutes.post("/test", (req, res, next) => {
  const recipient = requireText(req.body?.to, "L'adresse de test est requise");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) badRequest("Adresse de test invalide");
  sendTest(recipient)
    .then(() => res.json({ sent_to: recipient }))
    .catch(next);
});

/**
 * Milo peut-il lire l'adresse d'envoi et chaque boîte que les listes de
 * demandes reçoivent ? La lecture d'un message suffit à le savoir : une
 * permission Mail.Read absente, ou une stratégie d'accès qui écarte la boîte,
 * s'y voient tout de suite.
 */
entraRoutes.get("/mailboxes", (_req, res, next) => {
  const mailboxes = new Map<string, { email: string; usages: string[] }>();
  const add = (email: string, usage: string) => {
    const already = mailboxes.get(email.toLowerCase());
    if (already) already.usages.push(usage);
    else mailboxes.set(email.toLowerCase(), { email, usages: [usage] });
  };
  const sender = sendingAddress();
  if (sender) add(sender, "Adresse d'envoi");
  // Toutes celles que les listes disent, confirmées ou non : une boîte qui
  // attend sa confirmation doit déjà être lisible.
  for (const mailbox of configuredMailboxes()) add(mailbox.value, mailbox.usage);

  Promise.all(
    [...mailboxes.values()].map(async ({ email, usages }): Promise<MailboxCheck> => {
      const usage = usages.join(", ");
      try {
        await readMessages(email, 1);
        return { email, usage, ok: true, error: "" };
      } catch (error) {
        return {
          email,
          usage,
          ok: false,
          error: error instanceof Error ? error.message : "Accès refusé",
        };
      }
    }),
  )
    .then((results) => res.json(results))
    .catch(next);
});
