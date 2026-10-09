// The API tokens of "Paramétrage" > "API" (shared/api-tokens.ts). Reading them
// requires the "Voir" right on the Settings, generating, changing or revoking
// one the "Modifier" right (requireSettings, app.ts). A token is only given
// workspaces its author has, besides those it already had.

import { Router } from "express";
import type { Request } from "express";
import { API_TOKEN_DURATIONS } from "@milo/shared";
import type { ApiToken, ApiTokenDuration, CreatedApiToken, Id } from "@milo/shared";
import { transaction } from "../db/query.js";
import type { ApiTokenRow } from "../db/rows.js";
import { badRequest, orNotFound, requireText, toIds } from "../lib/http.js";
import { now } from "../lib/time.js";
import {
  apiAccountEmail,
  apiAccounts,
  apiTokenWorkspaces,
  apiTokens,
  generateApiToken,
  hashApiToken,
  validAccess,
} from "../repositories/api-tokens.js";
import { users, workspacesOf } from "../repositories/users.js";
import { workspaces } from "../repositories/workspaces.js";

const TOKEN_NOT_FOUND = "Jeton d'API introuvable";

const DAY = 24 * 60 * 60 * 1000;

const toApiToken = (row: ApiTokenRow, creator: string | null): ApiToken => ({
  id: row.id,
  name: row.name,
  access: validAccess(row.access) ?? "read",
  workspaces: apiTokenWorkspaces.of
    .all(row.id)
    .map((w) => workspaces.byId.get(w.workspace_id))
    .filter((w) => w !== undefined)
    .map(({ id, name }) => ({ id, name })),
  hint: row.hint,
  created_at: row.created_at,
  created_by: creator,
  last_used_at: row.last_used_at,
  expires_at: row.expires_at,
});

const tokenOf = (id: unknown): ApiToken => {
  const row = orNotFound(apiTokens.byId.get(id), TOKEN_NOT_FOUND);
  return toApiToken(row, row.created_by === null ? null : (users.byId.get(row.created_by)?.name ?? null));
};

/**
 * The workspaces asked for: at least one, each one the author's — or one the
 * token already had, which they may keep without having it themselves.
 */
const validWorkspaces = (req: Request, value: unknown, kept: Id[] = []): Id[] => {
  const ids = [...new Set(toIds(value))];
  if (ids.length === 0) badRequest("Choisissez au moins un workspace");
  const allowed = new Set([...workspacesOf(req.user).map((w) => w.id), ...kept]);
  if (ids.some((id) => !allowed.has(id))) badRequest("Workspace introuvable");
  return ids;
};

const validDuration = (value: unknown): ApiTokenDuration => {
  const duration = value === undefined ? null : value;
  if (!(API_TOKEN_DURATIONS as readonly unknown[]).includes(duration)) badRequest("Durée invalide");
  return duration as ApiTokenDuration;
};

const setWorkspaces = (tokenId: Id, ids: Id[]): void => {
  apiTokenWorkspaces.clear.run(tokenId);
  for (const id of ids) apiTokenWorkspaces.add.run(tokenId, id);
};

/** The token, its service account named after it, and its workspaces at once. */
const createToken = transaction(
  (name: string, access: string, ids: Id[], duration: ApiTokenDuration, author: Id): CreatedApiToken => {
    const secret = generateApiToken();
    const created = now();
    const account = apiAccounts.create.run(name, name, apiAccountEmail(), created);
    const expires = duration === null ? "" : new Date(Date.now() + duration * DAY).toISOString();
    const { lastInsertRowid } = apiTokens.create.run(
      account.lastInsertRowid,
      name,
      hashApiToken(secret),
      secret.slice(-4),
      access,
      author,
      created,
      expires,
    );
    setWorkspaces(Number(lastInsertRowid), ids);
    return { token: tokenOf(lastInsertRowid), secret };
  },
);

const updateToken = transaction((row: ApiTokenRow, name: string, access: string, ids: Id[]): void => {
  apiTokens.update.run(name, access, row.id);
  apiAccounts.rename.run(name, name, row.user_id);
  setWorkspaces(row.id, ids);
});

export const apiTokenRoutes = Router();

apiTokenRoutes.get("/", (_req, res) => {
  res.json(apiTokens.all.all().map((row) => toApiToken(row, row.creator)));
});

// Generated complete; its secret is in the answer, and nowhere else afterwards.
apiTokenRoutes.post("/", (req, res) => {
  const name = requireText(req.body.name, "Le nom est requis");
  const access = validAccess(req.body.access ?? "read") ?? badRequest("Accès inconnu");
  const ids = validWorkspaces(req, req.body.workspaces);
  const duration = validDuration(req.body.duration);
  res.status(201).json(createToken(name, access, ids, duration, req.user.id));
});

// What is not sent stays as it was. Its secret and its end do not change:
// a new token is generated instead.
apiTokenRoutes.put("/:id", (req, res) => {
  const row = orNotFound(apiTokens.byId.get(Number(req.params.id)), TOKEN_NOT_FOUND);
  const kept = apiTokenWorkspaces.of.all(row.id).map((w) => w.workspace_id);
  const name =
    req.body.name === undefined ? row.name : requireText(req.body.name, "Le nom est requis");
  const access =
    req.body.access === undefined
      ? row.access
      : (validAccess(req.body.access) ?? badRequest("Accès inconnu"));
  const ids =
    req.body.workspaces === undefined ? kept : validWorkspaces(req, req.body.workspaces, kept);
  updateToken(row, name, access, ids);
  res.json(tokenOf(row.id));
});

// Revoked at once: its next request is refused.
apiTokenRoutes.delete("/:id", (req, res) => {
  const row = orNotFound(apiTokens.byId.get(Number(req.params.id)), TOKEN_NOT_FOUND);
  apiTokens.remove.run(row.id);
  res.status(204).end();
});
