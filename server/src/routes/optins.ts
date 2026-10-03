// La confirmation des boîtes de support (lib/optin.ts) : ce que le réglage
// d'une liste de demandes en lit, la relance du code et sa saisie.

import { Router } from "express";
import type { MailboxOptinState } from "@milo/shared";
import { exigerWidget } from "../lib/droits.js";
import { confirmerParCode, relancer } from "../lib/optin.js";
import { releverLesBoites } from "../lib/support-mail.js";
import { entretenirAbonnements } from "../lib/support-webhooks.js";
import { optins } from "../repositories/optins.js";

/** La boîte se relève dès sa confirmation, et Graph prévient de ce qui y arrive. */
const apresConfirmation = (): void => {
  void releverLesBoites().catch((e: unknown) => console.error("Relève après confirmation :", e));
  void entretenirAbonnements().catch((e: unknown) =>
    console.error("Abonnements après confirmation :", e),
  );
};

/** « /api/mailbox-optins » : l'état des adresses, et leur relance. */
export const optinRoutes = Router();

/** La liste visée : la clé de liste de son widget (CLE_DE_LISTE). */
const listeDe = (valeur: unknown): string => (typeof valeur === "string" ? valeur : "");

optinRoutes.get("/", (req, res) => {
  exigerWidget(req, "support.list", "view");
  const liste = listeDe(req.query.liste);
  const emails = String(req.query.emails ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  const etats: MailboxOptinState[] = emails.map((email) => {
    const ligne = liste ? optins.de(liste, email) : undefined;
    return {
      email,
      status: ligne?.confirmed_at ? "confirmed" : "pending",
      // Un code n'est en cours que si l'e-mail est parti et qu'il vaut encore.
      sent_at: ligne?.code ? ligne.sent_at : "",
    };
  });
  res.json(etats);
});

optinRoutes.post("/resend", (req, res, next) => {
  exigerWidget(req, "support.list", "update");
  const emails: unknown[] = Array.isArray(req.body?.emails) ? req.body.emails : [];
  relancer(
    listeDe(req.body?.liste),
    emails.filter((e): e is string => typeof e === "string"),
  )
    .then((sent) => res.json({ sent }))
    .catch(next);
});

/** Le code à quatre chiffres de l'e-mail, saisi dans Milo à la place du lien. */
optinRoutes.post("/confirm", (req, res) => {
  exigerWidget(req, "support.list", "update");
  const email = typeof req.body?.email === "string" ? req.body.email : "";
  const code = typeof req.body?.code === "string" ? req.body.code : "";
  confirmerParCode(listeDe(req.body?.liste), email, code);
  apresConfirmation();
  res.json({ email, status: "confirmed" });
});
