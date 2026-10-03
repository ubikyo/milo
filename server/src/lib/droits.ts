// Les droits, tels que les routes les vérifient : une permission par type de
// widget, qui vaut partout. Chaque route passe par ici avant de lire ou
// d'écrire ce qu'un widget montre.
//
// Ce qui ne se voit pas est introuvable (404), comme un tableau privé : on
// n'a pas à deviner qu'il existe. Ce qui se voit sans se modifier est refusé
// (403).

import type { Request } from "express";
import type { Area, CompanyRights, Right, WidgetAccess } from "@milo/shared";
import { can, genreDuWidget } from "@milo/shared";
import { droitsSocietes, droitsWidgets } from "../repositories/users.js";
import { HttpError } from "./http.js";

// Calculés une fois par requête : une route peut les consulter plusieurs fois.
const parRequete = new WeakMap<Request, CompanyRights>();

export const droitsDe = (req: Request): CompanyRights => {
  const deja = parRequete.get(req);
  if (deja) return deja;
  const droits = droitsSocietes(req.user);
  parRequete.set(req, droits);
  return droits;
};

/** Le compte a-t-il ce droit ? (shared, `can`). */
export const peut = (req: Request, area: Area, right: Right): boolean =>
  can(droitsDe(req), area, right);

const REFUS: Record<Right, string> = {
  view: "Introuvable",
  create: "Vous n'avez pas le droit d'ajouter ici",
  update: "Vous n'avez pas le droit de modifier ici",
  delete: "Vous n'avez pas le droit de supprimer ici",
};

/**
 * Lève si le compte n'a pas ce droit : 404 pour « Voir », 403 pour le reste.
 * `introuvable` remplace le message du 404, pour qu'il nomme ce qui manque.
 */
export const exiger = (
  req: Request,
  area: Area,
  right: Right,
  introuvable?: string,
): void => {
  if (peut(req, area, right)) return;
  throw new HttpError(right === "view" ? 404 : 403, right === "view" && introuvable ? introuvable : REFUS[right]);
};

const DROIT_DE_LA_METHODE: Record<string, Right> = {
  POST: "create",
  PUT: "update",
  PATCH: "update",
  DELETE: "delete",
};

/** Le droit qu'une écriture demande, d'après sa méthode ; « Voir » pour une lecture. */
export const droitDeLaMethode = (req: Request): Right => DROIT_DE_LA_METHODE[req.method] ?? "view";



/** La permission du compte sur le type de ce widget (shared, genreDuWidget). */
export const accesAuWidget = (req: Request, type: string): WidgetAccess =>
  droitsWidgets(req.user)[genreDuWidget(type)];

/**
 * Le compte peut-il organiser les vues et les tableaux partagés — les créer,
 * les renommer, les ranger, poser leurs sections ? Il lui faut modifier au
 * moins un type de widget : sans quoi il n'aurait rien à y poser.
 */
export const peutOrganiser = (req: Request): boolean =>
  Object.values(droitsWidgets(req.user)).some((acces) => acces === "update");

/** Lève si le compte ne peut pas organiser les vues et les tableaux partagés. */
export const exigerOrganiser = (req: Request): void => {
  if (!peutOrganiser(req)) throw new HttpError(403, "Vous n'avez pas le droit de modifier ici");
};

/**
 * Lève si le compte n'a pas cette permission sur le type du widget : 404 quand
 * il ne le lit même pas — ce qu'on ne voit pas est introuvable —, 403 quand
 * il le lit sans pouvoir le modifier.
 */
export const exigerWidget = (req: Request, type: string, voulu: "view" | "update"): void => {
  const acces = accesAuWidget(req, type);
  if (acces === "") throw new HttpError(404, "Widget introuvable");
  if (voulu === "update" && acces !== "update") {
    throw new HttpError(403, "Vous n'avez pas le droit de modifier ce widget");
  }
};
