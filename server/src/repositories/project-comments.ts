// A project's thread.

import { mutation, selection } from "../db/query.js";
import type { CommentRow, WithAuthorColumns } from "../db/rows.js";

const COMMENT_SELECT = `
  SELECT comments.*, users.name AS author_name, users.email AS author_email
  FROM comments
  LEFT JOIN users ON users.id = comments.user_id
`;

export const comments = {
  raw: selection<CommentRow>("SELECT * FROM comments WHERE id = ?"),
  byId: selection<WithAuthorColumns<CommentRow>>(`${COMMENT_SELECT} WHERE comments.id = ?`),
  ofProject: selection<WithAuthorColumns<CommentRow>>(
    `${COMMENT_SELECT} WHERE comments.project_id = ? ORDER BY comments.created_at ASC`,
  ),
  create: mutation(
    `INSERT INTO comments (project_id, user_id, text, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ),
  createSystem: mutation(
    `INSERT INTO comments (project_id, user_id, text, system, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)`,
  ),
  update: mutation("UPDATE comments SET text = ?, updated_at = ? WHERE id = ?"),
  remove: mutation("DELETE FROM comments WHERE id = ?"),
};
