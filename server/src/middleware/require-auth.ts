// The session carrying the received token. Everything that follows in the
// application requires it to exist and not to have expired.

import type { NextFunction, Request, Response } from "express";
import { env } from "../env.js";
import {
  hasAccess,
  inOwnWorkspace,
  settingsRights,
  templatesAccess,
  themesAccess,
  workspaceRights,
  sessions,
  users,
} from "../repositories/users.js";
import type { UserRow } from "../db/rows.js";
import { HttpError } from "../lib/http.js";

declare global {
  // Express's module augmentation must go through a namespace: that is how its
  // own types are declared.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by `requireAuth`: any route that follows can rely on it. */
      user: UserRow;
      token: string;
    }
  }
}

const tokenOf = (req: Request): string | null => {
  const header = req.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
};

export const requireAuth = (req: Request, _res: Response, next: NextFunction): void => {
  const token = tokenOf(req);
  const session = token ? sessions.byToken.get(token) : undefined;

  if (!session || !token) throw new HttpError(401, "Authentification requise");

  // A forgotten session eventually closes. "expires_at" is empty for those
  // opened before sessions expired: the migration left them as they were, the
  // first use gives them a date.
  const currentTime = Date.now();
  if (session.expires_at && Date.parse(session.expires_at) < currentTime) {
    sessions.close.run(token);
    throw new HttpError(401, "Session expirée");
  }

  const account = users.byId.get(session.user_id);
  if (!account) throw new HttpError(401, "Authentification requise");
  // Access removed since login closes the session on the next request,
  // without waiting for it to expire.
  if (!hasAccess(account)) {
    sessions.close.run(token);
    throw new HttpError(401, "Votre accès à Milo a été retiré");
  }

  // Sliding window: the session starts a new round at each use. We do not
  // rewrite the row on every request — once per hour is enough to keep the
  // window going, and the write is what costs.
  const seenAgo = session.last_seen_at ? currentTime - Date.parse(session.last_seen_at) : Infinity;
  if (seenAgo > 3_600_000) {
    sessions.touch.run(
      new Date(currentTime).toISOString(),
      new Date(currentTime + env.sessionMaxIdleMs).toISOString(),
      token,
    );
  }

  // What they see and what they can do follow their workspace: it must be one
  // they still have.
  req.user = inOwnWorkspace(account);
  req.token = token;
  next();
};

/**
 * The Paramétrage and what it configures — companies, milestone types,
 * roles, access, Entra, backup. Reading it requires the "Voir" right on the
 * Paramétrage, writing to it the "Modifier" right. Set after `requireAuth`.
 */
export const requireSettings = (req: Request, _res: Response, next: NextFunction): void => {
  const rights = settingsRights(req.user);
  if (!rights.view) throw new HttpError(403, "Réservé à qui peut voir le Paramétrage");
  if (req.method !== "GET" && !rights.update) {
    throw new HttpError(403, "Réservé à qui peut modifier le Paramétrage");
  }
  next();
};

/**
 * Companies and milestone types are read everywhere in the application:
 * only their writes require the "Modifier" right on the Paramétrage.
 */
export const requireSettingsToWrite = (req: Request, res: Response, next: NextFunction): void => {
  if (req.method === "GET") {
    next();
    return;
  }
  requireSettings(req, res, next);
};

/**
 * The backup, reads included, requires the "Modifier" right: the archive
 * carries the whole database, application secret included.
 */
export const requireSettingsUpdate = (req: Request, _res: Response, next: NextFunction): void => {
  if (!settingsRights(req.user).update) {
    throw new HttpError(403, "Réservé à qui peut modifier le Paramétrage");
  }
  next();
};

/**
 * A section of the administration whose "Autorisée" opens a tab of its own:
 * everyone reads what it sets — the e-mails, the colors —, only whoever holds
 * it writes. Set after `requireAuth`.
 */
const requireToWrite =
  (allowed: (user: UserRow) => boolean, message: string) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (req.method !== "GET" && !allowed(req.user)) throw new HttpError(403, message);
    next();
  };

/** The e-mail templates: "Gestion des modèles d'email". */
export const requireTemplatesToWrite = requireToWrite(
  templatesAccess,
  "Réservé à qui peut gérer les modèles d'email",
);

/** The themes' colors: "Gestion des thèmes". */
export const requireThemesToWrite = requireToWrite(
  themesAccess,
  "Réservé à qui peut gérer les thèmes",
);

/**
 * Workspaces, right by right (administration): reading them requires
 * "Voir", deleting one "Supprimer", the rest — adding, renaming — "Créer".
 * Set after `requireAuth`.
 */
export const requireWorkspaces = (req: Request, _res: Response, next: NextFunction): void => {
  const rights = workspaceRights(req.user);
  if (req.method === "GET") {
    if (!rights.view) throw new HttpError(403, "Réservé à qui peut voir les workspaces");
  } else if (req.method === "DELETE") {
    if (!rights.delete) throw new HttpError(403, "Réservé à qui peut supprimer les workspaces");
  } else if (!rights.create) {
    throw new HttpError(403, "Réservé à qui peut créer les workspaces");
  }
  next();
};
