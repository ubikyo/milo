// The API tokens (shared/api-tokens.ts) and their service accounts.
//
// A token is handed out once, at its generation: only its SHA-256 is kept —
// a slow hash would be wasted on 32 random bytes, and it is looked up on
// every request. Each token acts as an account of its own, marked
// API_ACCOUNT, which signs in no other way and appears in no list.

import { createHash, randomBytes } from "node:crypto";
import { API_TOKEN_ACCESSES, API_TOKEN_PREFIX } from "@milo/shared";
import type { ApiTokenAccess, Id } from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import type { ApiTokenRow, UserRow } from "../db/rows.js";

/** The "users.system" value of a token's service account. */
export const API_ACCOUNT = 2;

export const isApiAccount = (user: UserRow): boolean => user.system === API_ACCOUNT;

export const apiTokens = {
  all: selection<ApiTokenRow & { creator: string | null }>(
    `SELECT t.*, u.name AS creator FROM api_tokens t
     LEFT JOIN users u ON u.id = t.created_by
     ORDER BY t.name COLLATE NOCASE, t.id`,
  ),
  byId: selection<ApiTokenRow>("SELECT * FROM api_tokens WHERE id = ?"),
  byHash: selection<ApiTokenRow>("SELECT * FROM api_tokens WHERE token_hash = ?"),
  byUser: selection<ApiTokenRow>("SELECT * FROM api_tokens WHERE user_id = ?"),
  create: mutation(
    `INSERT INTO api_tokens (user_id, name, token_hash, hint, access, created_by, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ),
  update: mutation("UPDATE api_tokens SET name = ?, access = ? WHERE id = ?"),
  touch: mutation("UPDATE api_tokens SET last_used_at = ? WHERE id = ?"),
  /** Revoked: the service account stays, signed with its name. */
  remove: mutation("DELETE FROM api_tokens WHERE id = ?"),
};

export const apiTokenWorkspaces = {
  of: selection<{ workspace_id: Id }>(
    `SELECT tw.workspace_id FROM api_token_workspaces tw
     JOIN workspaces w ON w.id = tw.workspace_id
     WHERE tw.token_id = ? ORDER BY w.position, w.id`,
  ),
  add: mutation("INSERT OR IGNORE INTO api_token_workspaces (token_id, workspace_id) VALUES (?, ?)"),
  clear: mutation("DELETE FROM api_token_workspaces WHERE token_id = ?"),
};

/** The service account a token acts as, named after it. */
export const apiAccounts = {
  create: mutation(
    `INSERT INTO users (name, first_name, email, password_hash, created_at, system)
     VALUES (?, ?, ?, '', ?, ${API_ACCOUNT})`,
  ),
  rename: mutation(`UPDATE users SET name = ?, first_name = ? WHERE id = ? AND system = ${API_ACCOUNT}`),
};

export const hashApiToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

/** A new token: the prefix tells it apart from a session's. */
export const generateApiToken = (): string =>
  `${API_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;

/**
 * The service account's own e-mail: the column is required and unique, and
 * no message is ever sent to it — notifications skip accounts that are not
 * people.
 */
export const apiAccountEmail = (): string => `api-${randomBytes(8).toString("hex")}@milo.invalid`;

export const validAccess = (value: unknown): ApiTokenAccess | null =>
  (API_TOKEN_ACCESSES as readonly unknown[]).includes(value) ? (value as ApiTokenAccess) : null;

/** The workspaces of a token's service account, in their order. */
export const apiAccountWorkspaces = (user: UserRow): Id[] => {
  const token = apiTokens.byUser.get(user.id);
  return token ? apiTokenWorkspaces.of.all(token.id).map((w) => w.workspace_id) : [];
};

/** May the service account write? Read only when its token is gone. */
export const apiAccountWrites = (user: UserRow): boolean =>
  apiTokens.byUser.get(user.id)?.access === "write";
