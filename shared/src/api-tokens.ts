// The API tokens of "Paramétrage" > "API": what an outside client — a chat
// connected through MCP, a script — presents to reach Milo. Each one is a
// service account of its own, limited to the workspaces it was given, in
// which it sees everything; it never reaches the Settings.

import type { Id, WorkspaceRef } from "./domain.js";

/** What a token may do in its workspaces: read only, or read and write. */
export const API_TOKEN_ACCESSES = ["read", "write"] as const;

export type ApiTokenAccess = (typeof API_TOKEN_ACCESSES)[number];

export const API_TOKEN_ACCESS_LABELS: Record<ApiTokenAccess, string> = {
  read: "Lecture",
  write: "Lecture/Écriture",
};

/** How long a new token lasts, in days: "null" for no end. */
export const API_TOKEN_DURATIONS = [30, 90, 365, null] as const;

export type ApiTokenDuration = (typeof API_TOKEN_DURATIONS)[number];

/** What every token starts with: it tells it apart from a session's. */
export const API_TOKEN_PREFIX = "milo_";

/**
 * The header a request names its workspace with, among the token's. Without
 * it, the token works in the one it last used — its first one to begin with.
 */
export const API_WORKSPACE_HEADER = "X-Milo-Workspace";

export interface ApiToken {
  id: Id;
  name: string;
  access: ApiTokenAccess;
  workspaces: WorkspaceRef[];
  /** Its last characters, to recognize it: the token itself is not kept. */
  hint: string;
  created_at: string;
  /** Who generated it; "null" once their account is gone. */
  created_by: string | null;
  /** Empty while it has never been used. */
  last_used_at: string;
  /** Empty when it never expires. */
  expires_at: string;
}

export interface ApiTokenInput {
  name?: string;
  access?: ApiTokenAccess;
  workspaces?: Id[];
  /** On creation only. */
  duration?: ApiTokenDuration;
}

/** A token just generated: the only time it is shown in full. */
export interface CreatedApiToken {
  token: ApiToken;
  secret: string;
}
