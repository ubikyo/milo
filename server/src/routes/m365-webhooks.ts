// What Microsoft calls: Graph's change notifications on what Mail and
// Calendar widgets read (lib/m365-webhooks.ts). No session — it is Microsoft
// at the other end: the subscription's secret ("clientState") says a
// notification really comes from us.

import { Router } from "express";
import { receiveNotifications } from "../lib/m365-webhooks.js";
import type { M365Notification } from "../lib/m365-webhooks.js";

export const m365WebhookRoutes = Router();

m365WebhookRoutes.post("/notifications", (req, res) => {
  // A subscription's validation: Graph expects its token back, as plain
  // text, within ten seconds.
  const token = req.query["validationToken"];
  if (typeof token === "string") {
    res.type("text/plain").send(token);
    return;
  }
  res.status(202).end();
  receiveNotifications((req.body?.value ?? []) as M365Notification[]);
});
