// The Entra tab of "Paramétrage": the application, the administrators group,
// the sending address, and the checks — a test message, access to the
// support inboxes that the request lists receive.

import { Router } from "express";
import { ENTRA_CHECKS } from "@milo/shared";
import type { MailboxCheck } from "@milo/shared";
import {
  checkEntra,
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

// The state of Milo's connection to Entra, and the two actions that change it.
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

// One step of the connection check, which the tab runs one by one.
entraRoutes.post("/check/:step", (req, res, next) => {
  const step = String(req.params["step"]);
  if (!ENTRA_CHECKS.some((c) => c.value === step)) badRequest("Vérification inconnue");
  checkEntra(step)
    .then((result) => res.json(result))
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
 * Can Milo read the sending address and each inbox that the request lists
 * receive? Reading a message is enough to tell: a missing Mail.Read
 * permission, or an access policy that excludes the inbox, shows up right
 * away.
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
  // All those the lists name, confirmed or not: an inbox awaiting its
  // confirmation must already be readable.
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
