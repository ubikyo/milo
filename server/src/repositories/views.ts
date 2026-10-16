// Views: what the bottom selector offers. Each carries its boards
// (repositories/boards.ts). A view is shown to its owner, and to whoever sees
// one of its boards (repositories/shares.ts). A view is only visible from its
// workspace: that is what isolates them, since everything a board carries
// follows its view.

import type { Id } from "@milo/shared";
import { mutation, scalar, selection } from "../db/query.js";
import type { NextRow, UserRow, ViewRow } from "../db/rows.js";
import { HttpError } from "../lib/http.js";
import { SEES_VIEW } from "./shares.js";

export const VIEW_NOT_FOUND = "Vue introuvable";

export const views = {
  byId: selection<ViewRow>("SELECT * FROM views WHERE id = ?"),
  /** Those of a workspace that this account sees: (workspace, account). */
  visibleTo: selection<ViewRow>(
    `SELECT v.* FROM views v, users me
     WHERE v.workspace_id = ? AND me.id = ? AND ${SEES_VIEW("v", "me")}
     ORDER BY v.position, v.id`,
  ),
  nextPosition: scalar<NextRow>(
    "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM views WHERE workspace_id = ?",
  ),
  create: mutation(
    `INSERT INTO views (workspace_id, name, position, owner_id, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ),
  rename: mutation("UPDATE views SET name = ? WHERE id = ?"),
  setParentDisabled: mutation("UPDATE views SET parent_disabled = ? WHERE id = ?"),
  remove: mutation("DELETE FROM views WHERE id = ?"),
};

const seen = selection<{ id: Id }>(
  `SELECT v.id FROM views v JOIN users me ON me.id = ? WHERE v.id = ? AND ${SEES_VIEW("v", "me")}`,
);

/**
 * A view is only visible from its workspace, to its owner and to whoever
 * sees one of its boards.
 */
export const isViewVisible = (view: ViewRow | undefined, user: UserRow): boolean =>
  Boolean(view) && view?.workspace_id === user.workspace_id && Boolean(seen.get(user.id, view?.id));

/**
 * The requested view, if it exists and this person may see it. Otherwise
 * "not found": saying "forbidden" would confirm that it exists.
 */
export const openView = (id: unknown, user: UserRow): ViewRow => {
  const view = views.byId.get(id);
  if (!isViewVisible(view, user) || !view) throw new HttpError(404, VIEW_NOT_FOUND);
  return view;
};

/** The id of a view this account sees, or "null". */
export const visibleView = (id: Id, user: UserRow): boolean => isViewVisible(views.byId.get(id), user);
