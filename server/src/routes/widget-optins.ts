// The consent of the people a Calendar or Mail widget names
// (lib/widget-optin.ts): what its drawer reads of it, resending the code,
// entering it — and, once confirmed, what can be read of them: their
// calendars, their mail folders.

import { Router } from "express";
import type { MailboxOptinState } from "@milo/shared";
import { requireWidget } from "../lib/rights.js";
import { badRequest } from "../lib/http.js";
import { checkCode } from "../lib/optin.js";
import { entraCalendars, entraMailFolders } from "../lib/entra.js";
import { calendarOptin } from "../lib/calendar-optin.js";
import { mailOptin } from "../lib/mail-optin.js";
import type { WidgetOptin } from "../lib/widget-optin.js";

/**
 * The routes of one widget type: "keyParam" carries the widget's key,
 * "choices" lists what a confirmed person offers, under "/:choicesPath".
 */
const optinRoutes = (
  type: string,
  keyParam: string,
  optin: WidgetOptin,
  choicesPath: string,
  choices: (email: string) => Promise<unknown>,
) => {
  const routes = Router();

  const keyOf = (source: unknown): string => {
    const value = ((source ?? {}) as Record<string, unknown>)[keyParam];
    return typeof value === "string" ? value : "";
  };

  routes.get("/", (req, res) => {
    requireWidget(req, type, "view");
    const key = keyOf(req.query);
    const emails = String(req.query.emails ?? "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    const states: MailboxOptinState[] = emails.map((email) => {
      const row = key ? optin.table.de(key, email) : undefined;
      return {
        email,
        status: row?.confirmed_at ? "confirmed" : "pending",
        // A code is only pending if the e-mail was sent and it is still valid.
        sent_at: row?.code ? row.sent_at : "",
      };
    });
    res.json(states);
  });

  routes.post("/resend", (req, res, next) => {
    requireWidget(req, type, "update");
    const emails: unknown[] = Array.isArray(req.body?.emails) ? req.body.emails : [];
    optin
      .retry(
        keyOf(req.body),
        emails.filter((e): e is string => typeof e === "string"),
        req.user.name,
      )
      .then((sent) => res.json({ sent }))
      .catch(next);
  });

  /** The e-mail's four-digit code, passed on by the person. */
  routes.post("/confirm", (req, res) => {
    requireWidget(req, type, "update");
    const email = typeof req.body?.email === "string" ? req.body.email : "";
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    checkCode(optin.table, keyOf(req.body), email, code);
    res.json({ email, status: "confirmed" });
  });

  /**
   * What a person who consented offers, for the drawer to choose what the
   * widget reads. Before the code is entered, nothing is read of them — not
   * even the names of their calendars or folders.
   */
  routes.get(`/${choicesPath}`, (req, res, next) => {
    requireWidget(req, type, "update");
    const email = String(req.query.email ?? "").trim().toLowerCase();
    if (!optin.confirmed(keyOf(req.query)).has(email)) {
      badRequest("Cette adresse n'a pas encore confirmé");
    }
    choices(email)
      .then((list) => res.json(list))
      .catch(next);
  });

  return routes;
};

/** "/api/calendar-optins": a Calendar widget's people, and their calendars. */
export const calendarOptinRoutes = optinRoutes(
  "calendar",
  "calendar_key",
  calendarOptin,
  "calendars",
  entraCalendars,
);

/** "/api/mail-optins": a Mail widget's people, and their mail folders. */
export const mailOptinRoutes = optinRoutes("mail", "mail_key", mailOptin, "folders", entraMailFolders);
