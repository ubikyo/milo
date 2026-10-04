// Les workspaces : une équipe chacun, avec ses vues — et tout ce qu'elles
// portent — et ses accès. Qui en a plusieurs passe de l'un à l'autre par le
// sélecteur ; ce qu'il voit et ce qu'il peut y faire suivent celui qu'il a
// choisi (repositories/users.ts, workspaceCourant).

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

/** Les vues d'un workspace, toutes : privées comprises. */
export const workspaceViews = selection<{ id: number }>(
  "SELECT id FROM views WHERE workspace_id = ?",
);
