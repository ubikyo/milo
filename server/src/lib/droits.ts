// Les droits par société, tels que les routes les vérifient.
//
// Un rôle se donne société par société (role_assignments) : on peut tout
// faire chez l'une, seulement lire chez l'autre, ne rien voir chez une
// troisième. Chaque route des modes passe par ici avant de lire ou d'écrire
// ce qui appartient à une société.
//
// Ce qui ne se voit pas est introuvable (404), comme un tableau privé : on
// n'a pas à deviner qu'il existe. Ce qui se voit sans se modifier est refusé
// (403).

import type { NextFunction, Request, Response } from "express";
import type { Area, CompanyRights, Id, Right } from "@milo/shared";
import { can, companiesWith } from "@milo/shared";
import { droitsSocietes } from "../repositories/users.js";
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

/** Le compte a-t-il ce droit dans cette société ? (shared, `can`). */
export const peut = (req: Request, area: Area, right: Right, companyId?: unknown): boolean =>
  can(droitsDe(req), area, right, companyId as Id | string | null | undefined);

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
  companyId?: unknown,
  introuvable?: string,
): void => {
  if (peut(req, area, right, companyId)) return;
  throw new HttpError(right === "view" ? 404 : 403, right === "view" && introuvable ? introuvable : REFUS[right]);
};

/**
 * De quoi filtrer une requête SQL sur les sociétés visibles : `societes` est
 * la liste JSON des sociétés où le compte a le droit (à passer à
 * `json_each`), `sansSociete` vaut 1 si ce qui n'a pas de société se voit.
 */
export const filtreSocietes = (
  req: Request,
  area: Area,
  right: Right = "view",
): { societes: string; sansSociete: 0 | 1 } => ({
  societes: JSON.stringify(companiesWith(droitsDe(req), area, right)),
  sansSociete: peut(req, area, right, null) ? 1 : 0,
});

/**
 * La clause SQL qui va avec : `colonne` est la colonne de la société.
 * Paramètres nommés @societes et @sansSociete.
 */
export const clauseSocietes = (colonne: string): string =>
  `(${colonne} IN (SELECT value FROM json_each(@societes)) OR (${colonne} IS NULL AND @sansSociete = 1))`;

const DROIT_DE_LA_METHODE: Record<string, Right> = {
  POST: "create",
  PUT: "update",
  PATCH: "update",
  DELETE: "delete",
};

/** Le droit qu'une écriture demande, d'après sa méthode ; « Voir » pour une lecture. */
export const droitDeLaMethode = (req: Request): Right => DROIT_DE_LA_METHODE[req.method] ?? "view";

/**
 * Pour un mode qui n'appartient à aucune société (le mode Accès) : chaque
 * requête demande le droit que dit sa méthode — lire, « Voir » ; POST,
 * « Ajouter » ; PUT, « Modifier » ; DELETE, « Supprimer » —, dans au moins
 * une société. Toutes les écritures du routeur doivent suivre cette
 * convention, sauf celles que « voirSuffit » désigne : elles ne touchent que
 * ce qui est à soi.
 */
export const exigerParMethode =
  (area: Area, voirSuffit?: (req: Request) => boolean) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    exiger(req, area, voirSuffit?.(req) ? "view" : (DROIT_DE_LA_METHODE[req.method] ?? "view"));
    next();
  };

/** Pour un mode sans société, comme « exigerParMethode », mais « Voir » seulement. */
export const exigerVoir =
  (area: Area) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    exiger(req, area, "view");
    next();
  };
