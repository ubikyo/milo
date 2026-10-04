// Views: what the bottom selector offers. Each carries its boards
// (repositories/boards.ts). A private view is only shown to its author, and
// so are its boards. A view is only visible from its workspace: that is what
// isolates them, since everything a board carries follows its view.

import type { Id } from "@milo/shared";
import { mutation, scalar, selection } from "../db/query.js";
import type { NextRow, UserRow, ViewRow } from "../db/rows.js";
import { HttpError } from "../lib/http.js";

export const VIEW_NOT_FOUND = "Vue introuvable";

export const views = {
  byId: selection<ViewRow>("SELECT * FROM views WHERE id = ?"),
  /** Those of a workspace that this account sees: (workspace, account). */
  visibleTo: selection<ViewRow>(
    `SELECT * FROM views WHERE workspace_id = ? AND (is_private = 0 OR owner_id = ?)
     ORDER BY position, id`,
  ),
  nextPosition: scalar<NextRow>(
    "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM views WHERE workspace_id = ?",
  ),
  create: mutation(
    `INSERT INTO views (workspace_id, name, position, is_private, owner_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ),
  update: mutation("UPDATE views SET name = ?, is_private = ?, owner_id = ? WHERE id = ?"),
  remove: mutation("DELETE FROM views WHERE id = ?"),
};

/**
 * A view is only visible from its workspace. When private, it belongs to
 * its author alone; with no author, it is open to everyone.
 */
export const isViewVisible = (view: ViewRow | undefined, user: UserRow): boolean =>
  Boolean(view) &&
  view?.workspace_id === user.workspace_id &&
  (!view?.is_private || view.owner_id === user.id);

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
