// Les droits, tels que les routes les vérifient : une permission par type de
// widget, qui vaut partout. Chaque route passe par ici avant de lire ou
// d'écrire ce qu'un widget montre.
//
// Ce qui ne se voit pas est introuvable (404), comme un tableau privé : on
// n'a pas à deviner qu'il existe. Ce qui se voit sans se modifier est refusé
// (403).

import type { Request } from "express";
import type { Area, CompanyRights, Right, WidgetAccess } from "@milo/shared";
import { can, widgetKind } from "@milo/shared";
import { companyRights, widgetRights } from "../repositories/users.js";
import { HttpError } from "./http.js";

// Calculés une fois par requête : une route peut les consulter plusieurs fois.
const byQuery = new WeakMap<Request, CompanyRights>();

export const rightsOf = (req: Request): CompanyRights => {
  const already = byQuery.get(req);
  if (already) return already;
  const rights = companyRights(req.user);
  byQuery.set(req, rights);
  return rights;
};

/** Le compte a-t-il ce droit ? (shared, `can`). */
export const requestCan = (req: Request, area: Area, right: Right): boolean =>
  can(rightsOf(req), area, right);

const REFUSALS: Record<Right, string> = {
  view: "Introuvable",
  create: "Vous n'avez pas le droit d'ajouter ici",
  update: "Vous n'avez pas le droit de modifier ici",
  delete: "Vous n'avez pas le droit de supprimer ici",
};

/**
 * Lève si le compte n'a pas ce droit : 404 pour « Voir », 403 pour le reste.
 * `introuvable` remplace le message du 404, pour qu'il nomme ce qui manque.
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

/** Le droit qu'une écriture demande, d'après sa méthode ; « Voir » pour une lecture. */
export const rightForMethod = (req: Request): Right => RIGHT_BY_METHOD[req.method] ?? "view";



/** La permission du compte sur le type de ce widget (shared, genreDuWidget). */
export const widgetAccess = (req: Request, type: string): WidgetAccess =>
  widgetRights(req.user)[widgetKind(type)];

/**
 * Le compte peut-il organiser les vues et les tableaux partagés — les créer,
 * les renommer, les ranger, poser leurs sections ? Il lui faut modifier au
 * moins un type de widget : sans quoi il n'aurait rien à y poser.
 */
export const canArrange = (req: Request): boolean =>
  Object.values(widgetRights(req.user)).some((access) => access === "update");

/** Lève si le compte ne peut pas organiser les vues et les tableaux partagés. */
export const requireOrganize = (req: Request): void => {
  if (!canArrange(req)) throw new HttpError(403, "Vous n'avez pas le droit de modifier ici");
};

/**
 * Lève si le compte n'a pas cette permission sur le type du widget : 404 quand
 * il ne le lit même pas — ce qu'on ne voit pas est introuvable —, 403 quand
 * il le lit sans pouvoir le modifier.
 */
export const requireWidget = (req: Request, type: string, desired: "view" | "update"): void => {
  const access = widgetAccess(req, type);
  if (access === "") throw new HttpError(404, "Widget introuvable");
  if (desired === "update" && access !== "update") {
    throw new HttpError(403, "Vous n'avez pas le droit de modifier ce widget");
  }
};
