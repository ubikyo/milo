// A view's sub-views — those without a group first, then each group's —: the
// list under its tab. A "page"
// sub-view has its own boards (boards.subview_id), which the view's boards
// leave out (repositories/boards.ts).

import { mutation, selection } from "../db/query.js";
import type { SubviewGroupRow, SubviewRow } from "../db/rows.js";

export const subviewGroups = {
  ofView: selection<SubviewGroupRow>(
    "SELECT * FROM subview_groups WHERE view_id = ? ORDER BY position, id",
  ),
  create: mutation("INSERT INTO subview_groups (view_id, name, position) VALUES (?, ?, ?)"),
  update: mutation("UPDATE subview_groups SET name = ?, position = ? WHERE id = ?"),
  remove: mutation("DELETE FROM subview_groups WHERE id = ?"),
};

export const subviews = {
  byId: selection<SubviewRow>("SELECT * FROM subviews WHERE id = ?"),
  ofView: selection<SubviewRow>(
    "SELECT * FROM subviews WHERE view_id = ? ORDER BY position, id",
  ),
  create: mutation(
    `INSERT INTO subviews (view_id, group_id, name, kind, position)
     VALUES (?, ?, ?, ?, ?)`,
  ),
  update: mutation(
    "UPDATE subviews SET group_id = ?, name = ?, kind = ?, position = ? WHERE id = ?",
  ),
  remove: mutation("DELETE FROM subviews WHERE id = ?"),
};
