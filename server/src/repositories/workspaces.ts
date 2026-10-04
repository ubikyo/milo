// Workspaces: one team each, with its views — and everything they carry —
// and its access rights. Whoever has several switches between them via the
// selector; what they see and what they can do there follows the one they
// chose (repositories/users.ts, currentWorkspace).

import { mutation, scalar, selection } from "../db/query.js";
import type { NextRow, WorkspaceRow } from "../db/rows.js";

export const WORKSPACE_NOT_FOUND = "Workspace introuvable";

export const workspaces = {
  all: selection<WorkspaceRow>("SELECT * FROM workspaces ORDER BY position, id"),
  byId: selection<WorkspaceRow>("SELECT * FROM workspaces WHERE id = ?"),
  first: selection<WorkspaceRow>("SELECT * FROM workspaces ORDER BY position, id LIMIT 1"),
  nextPosition: scalar<NextRow>("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM workspaces"),
  create: mutation("INSERT INTO workspaces (name, position, created_at) VALUES (?, ?, ?)"),
  rename: mutation("UPDATE workspaces SET name = ? WHERE id = ?"),
  remove: mutation("DELETE FROM workspaces WHERE id = ?"),
};

/** All the views of a workspace, private ones included. */
export const workspaceViews = selection<{ id: number }>(
  "SELECT id FROM views WHERE workspace_id = ?",
);
