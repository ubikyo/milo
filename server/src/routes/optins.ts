// La confirmation des boîtes de support (lib/optin.ts) : ce que le réglage
// d'une liste de demandes en lit, la relance du code et sa saisie.

import { Router } from "express";
import type { MailboxOptinState } from "@milo/shared";
import { requireWidget } from "../lib/rights.js";
import { confirmByCode, retry } from "../lib/optin.js";
import { pollMailboxes } from "../lib/support-mail.js";
import { maintainSubscriptions } from "../lib/support-webhooks.js";
import { optins } from "../repositories/optins.js";

/** La boîte se relève dès sa confirmation, et Graph prévient de ce qui y arrive. */
const afterConfirmation = (): void => {
  void pollMailboxes().catch((e: unknown) => console.error("Relève après confirmation :", e));
  void maintainSubscriptions().catch((e: unknown) =>
    console.error("Abonnements après confirmation :", e),
  );
};

/** « /api/mailbox-optins » : l'état des adresses, et leur relance. */
export const optinRoutes = Router();

/**
 * La liste visée : la clé de liste de son widget (LIST_KEY), dans
 * « list_key » — ou « liste », le nom qu'elle portait avant.
 */
const listOf = (source: unknown): string => {
  const fields = (source ?? {}) as { list_key?: unknown; liste?: unknown };
  const value = fields.list_key ?? fields.liste;
  return typeof value === "string" ? value : "";
};

optinRoutes.get("/", (req, res) => {
  requireWidget(req, "support.list", "view");
  const list = listOf(req.query);
  const emails = String(req.query.emails ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  const states: MailboxOptinState[] = emails.map((email) => {
    const row = list ? optins.de(list, email) : undefined;
    return {
      email,
      status: row?.confirmed_at ? "confirmed" : "pending",
      // Un code n'est en cours que si l'e-mail est parti et qu'il vaut encore.
      sent_at: row?.code ? row.sent_at : "",
    };
  });
  res.json(states);
});

optinRoutes.post("/resend", (req, res, next) => {
  requireWidget(req, "support.list", "update");
  const emails: unknown[] = Array.isArray(req.body?.emails) ? req.body.emails : [];
  retry(
    listOf(req.body),
    emails.filter((e): e is string => typeof e === "string"),
  )
    .then((sent) => res.json({ sent }))
    .catch(next);
});

/** Le code à quatre chiffres de l'e-mail, saisi dans Milo à la place du lien. */
optinRoutes.post("/confirm", (req, res) => {
  requireWidget(req, "support.list", "update");
  const email = typeof req.body?.email === "string" ? req.body.email : "";
  const code = typeof req.body?.code === "string" ? req.body.code : "";
  confirmByCode(listOf(req.body), email, code);
  afterConfirmation();
  res.json({ email, status: "confirmed" });
});
