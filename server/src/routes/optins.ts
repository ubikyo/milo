// Confirmation of the support inboxes (lib/optin.ts): what a request list's
// setting reads of it, resending the code and entering it.

import { Router } from "express";
import type { MailboxOptinState } from "@milo/shared";
import { requireWidget } from "../lib/rights.js";
import { confirmByCode, retry } from "../lib/optin.js";
import { pollMailboxes } from "../lib/support-mail.js";
import { maintainSubscriptions } from "../lib/support-webhooks.js";
import { optins } from "../repositories/optins.js";

/** The inbox is polled as soon as it is confirmed, and Graph notifies of what arrives in it. */
const afterConfirmation = (): void => {
  void pollMailboxes().catch((e: unknown) => console.error("Poll after confirmation:", e));
  void maintainSubscriptions().catch((e: unknown) =>
    console.error("Subscriptions after confirmation:", e),
  );
};

/** "/api/mailbox-optins": the state of the addresses, and resending them. */
export const optinRoutes = Router();

/**
 * The targeted list: its widget's list key (LIST_KEY), in "list_key" — or
 * "liste", the name it had before.
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
      // A code is only pending if the e-mail was sent and it is still valid.
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

/** The e-mail's four-digit code, entered in Milo in place of the link. */
optinRoutes.post("/confirm", (req, res) => {
  requireWidget(req, "support.list", "update");
  const email = typeof req.body?.email === "string" ? req.body.email : "";
  const code = typeof req.body?.code === "string" ? req.body.code : "";
  confirmByCode(listOf(req.body), email, code);
  afterConfirmation();
  res.json({ email, status: "confirmed" });
});
