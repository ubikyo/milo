// Rights, as the routes check them: one permission per widget type, valid
// everywhere. Every route goes through here before reading or writing what a
// widget shows.
//
// What cannot be seen is not found (404), like a private board: no need to
// hint that it exists. What can be seen but not modified is refused (403).

import type { Request } from "express";
import type { Area, CompanyRights, Right, WidgetAccess } from "@milo/shared";
import { can, widgetKind } from "@milo/shared";
import { companyRights, widgetRights } from "../repositories/users.js";
import { HttpError } from "./http.js";

// Computed once per request: a route may consult them several times.
const byQuery = new WeakMap<Request, CompanyRights>();

export const rightsOf = (req: Request): CompanyRights => {
  const already = byQuery.get(req);
  if (already) return already;
  const rights = companyRights(req.user);
  byQuery.set(req, rights);
  return rights;
};

/** Does the account have this right? (shared, `can`). */
export const requestCan = (req: Request, area: Area, right: Right): boolean =>
  can(rightsOf(req), area, right);

const REFUSALS: Record<Right, string> = {
  view: "Introuvable",
  create: "Vous n'avez pas le droit d'ajouter ici",
  update: "Vous n'avez pas le droit de modifier ici",
  delete: "Vous n'avez pas le droit de supprimer ici",
};

/**
 * Throws if the account lacks this right: 404 for "Voir", 403 for the rest.
 * `notFound` replaces the 404 message, so that it names what is missing.
 */
export const require = (
  req: Request,
  area: Area,
  right: Right,
  notFound?: string,
): void => {
  if (requestCan(req, area, right)) return;
  throw new HttpError(right === "view" ? 404 : 403, right === "view" && notFound ? notFound : REFUSALS[right]);
};

const RIGHT_BY_METHOD: Record<string, Right> = {
  POST: "create",
  PUT: "update",
  PATCH: "update",
  DELETE: "delete",
};

/** The right a write requires, based on its method; "Voir" for a read. */
export const rightForMethod = (req: Request): Right => RIGHT_BY_METHOD[req.method] ?? "view";



/** The account's permission on this widget's type (shared, widgetKind). */
export const widgetAccess = (req: Request, type: string): WidgetAccess =>
  widgetRights(req.user)[widgetKind(type)];

/**
 * Can the account organize shared views and boards — create them, rename
 * them, arrange them, set their sections? It must be able to modify at least
 * one widget type: otherwise it would have nothing to put in them.
 */
export const canArrange = (req: Request): boolean =>
  Object.values(widgetRights(req.user)).some((access) => access === "update");

/** Throws if the account cannot organize shared views and boards. */
export const requireOrganize = (req: Request): void => {
  if (!canArrange(req)) throw new HttpError(403, "Vous n'avez pas le droit de modifier ici");
};

/**
 * Throws if the account lacks this permission on the widget's type: 404 when
 * it cannot even read it — what is not seen is not found —, 403 when it
 * reads it without being able to modify it.
 */
export const requireWidget = (req: Request, type: string, desired: "view" | "update"): void => {
  const access = widgetAccess(req, type);
  if (access === "") throw new HttpError(404, "Widget introuvable");
  if (desired === "update" && access !== "update") {
    throw new HttpError(403, "Vous n'avez pas le droit de modifier ce widget");
  }
};
