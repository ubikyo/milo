// What Microsoft calls: Graph's change notifications on the support inboxes
// (lib/support-webhooks.ts). No session — it is Microsoft at the other end,
// not a person: it is the subscription's secret ("clientState") that says a
// notification really comes from us.

import { Router } from "express";
import { pollMailboxes } from "../lib/support-mail.js";
import { notificationsSecret } from "../lib/support-webhooks.js";

export const supportMailRoutes = Router();

interface Notification {
  clientState?: string;
}

supportMailRoutes.post("/notifications", (req, res) => {
  // A subscription's validation: Graph expects its token back, as plain
  // text, within ten seconds.
  const token = req.query["validationToken"];
  if (typeof token === "string") {
    res.type("text/plain").send(token);
    return;
  }

  // Graph expects a quick response: the poll happens afterwards.
  res.status(202).end();

  const secret = notificationsSecret();
  const notifications = (req.body?.value ?? []) as Notification[];
  if (notifications.some((n) => n.clientState === secret)) {
    pollMailboxes().catch((error) => console.error("Poll on notification:", error));
  }
});
