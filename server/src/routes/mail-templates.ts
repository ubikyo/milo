// The templates of Milo's e-mails, in the "Notifications" section of
// "Paramétrage" (see lib/mail-template.ts).

import { Router } from "express";
import { isMailTemplateKey } from "@milo/shared";
import type { MailTemplateKey } from "@milo/shared";
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

mailTemplateRoutes.get("/", (_req, res) => {
  res.json(mailTemplates());
});

// The empty template goes back to Milo's own.
mailTemplateRoutes.put("/:key", (req, res, next) => {
  saveMailTemplate(keyOf(req.params.key), mjmlOf(req.body))
    .then(() => res.json(mailTemplates()))
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
  previewReply(key, {
    content: text("content"),
    ticket: text("ticket"),
    subject: text("subject"),
    name: text("name"),
    status: text("status"),
    url: text("url"),
    requester: requesterOf(body["requester"]),
  })
    .then((html) => res.json({ html }))
    .catch(next);
});

// What the template being edited gives, filled with sample data.
mailTemplateRoutes.post("/:key/preview", (req, res, next) => {
  previewMailTemplate(keyOf(req.params.key), mjmlOf(req.body), req.user.name || req.user.email)
    .then((preview) => res.json(preview))
    .catch(next);
});
