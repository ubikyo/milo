// The templates of Milo's e-mails, in the "Notifications" section of
// "Paramétrage" (see lib/mail-template.ts). Those of a Tickets widget are its
// own: the request names it (board, list).

import { Router } from "express";
import type { Request } from "express";
import { isMailTemplateKey } from "@milo/shared";
import type { MailTemplateKey, Right } from "@milo/shared";
import { supportScope } from "../lib/support-scope.js";
import { originalMail } from "../lib/support-original.js";
import { supportRequests } from "../repositories/support.js";
import { notFound } from "../lib/http.js";
import {
  isReplyTemplateKey,
  mailTemplates,
  previewMailTemplate,
  previewReply,
  saveMailTemplate,
} from "../lib/mail-template.js";

export const mailTemplateRoutes = Router();

const keyOf = (value: unknown): MailTemplateKey =>
  isMailTemplateKey(value) ? value : notFound("Modèle d'e-mail introuvable");

const mjmlOf = (body: unknown): string => String((body as { mjml?: unknown } | null)?.mjml ?? "");

/** The Tickets widget named, if one is: its templates are its own. */
const scopeOf = (req: Request, board: unknown, list: unknown, right: Right) =>
  list ? supportScope(req, board, list, right) : undefined;

mailTemplateRoutes.get("/", (req, res) => {
  res.json(mailTemplates(scopeOf(req, req.query.board, req.query.list, "view")));
});

// The empty template goes back to Milo's own.
mailTemplateRoutes.put("/:key", (req, res, next) => {
  const scope = scopeOf(req, req.body?.board_id, req.body?.list_key, "update");
  saveMailTemplate(keyOf(req.params.key), mjmlOf(req.body), scope)
    .then(() => res.json(mailTemplates(scope)))
    .catch(next);
});

/** The requester a preview cites, as the client sends it: four texts. */
const requesterOf = (value: unknown) => {
  const v = (value ?? {}) as Record<string, unknown>;
  const text = (field: string) => String(v[field] ?? "");
  return {
    first_name: text("first_name"),
    last_name: text("last_name"),
    full_name: text("full_name"),
    email: text("email"),
  };
};

// A support content — or an order's — in its reply template, as saved — the
// content window's preview.
mailTemplateRoutes.post("/:key/reply-preview", (req, res, next) => {
  const key = keyOf(req.params.key);
  if (!isReplyTemplateKey(key)) return notFound("Modèle de réponse introuvable");
  const body = (req.body ?? {}) as Record<string, unknown>;
  const text = (field: string) => String(body[field] ?? "");
  const scope = scopeOf(req, body["board_id"], body["list_key"], "view");
  // A request's reply quotes its e-mail — one of the widget's own, which the
  // scope has just opened; without "request_id", the sample's.
  const request =
    body["request_id"] && scope ? supportRequests.byId.get(Number(body["request_id"])) : undefined;
  const original =
    "request_id" in body
      ? request && request.board_id === scope?.board && request.list_key === scope.list
        ? originalMail(request)
        : null
      : undefined;
  previewReply(key, {
    content: text("content"),
    ticket: text("ticket"),
    subject: text("subject"),
    name: text("name"),
    status: text("status"),
    url: text("url"),
    requester: requesterOf(body["requester"]),
    original,
  }, scope)
    .then((html) => res.json({ html }))
    .catch(next);
});

// What the template being edited gives, filled with sample data.
mailTemplateRoutes.post("/:key/preview", (req, res, next) => {
  previewMailTemplate(keyOf(req.params.key), mjmlOf(req.body), req.user.name || req.user.email)
    .then((preview) => res.json(preview))
    .catch(next);
});
