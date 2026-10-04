// Who sees a board, and what they may do with it. A board belongs to whoever
// created it; its owner shares it, from "Partager" on its view, with users or
// Entra groups that have access to the workspace: "read" keeps its layout as it is, "full"
// grants everything but deleting and sharing it. A view shows to its owner,
// and to whoever sees one of its boards. The "admin" account sees everything,
// as an owner: nothing is ever out of reach.

import type {
  BoardAccess,
  EntraPrincipal,
  Id,
  PrincipalPermissions,
  ShareLevel,
  ViewSharePermissions,
} from "@milo/shared";
import { mutation, selection, transaction } from "../db/query.js";
import type { UserRow } from "../db/rows.js";

/**
 * The condition, in SQL, under which share "s" designates account "me" (a
 * users row): itself, or one of its groups. Unreadable groups count as none.
 */
const SHARED_WITH = (s: string, me: string): string =>
  `((${s}.principal_type = 'user' AND ${s}.principal_id = ${me}.entra_id)
    OR (${s}.principal_type = 'group' AND ${s}.principal_id IN (
      SELECT value FROM json_each(
        CASE WHEN json_valid(${me}.entra_groups) THEN ${me}.entra_groups ELSE '[]' END))))`;

/** The condition, in SQL, under which account "me" sees board "b". */
export const SEES_BOARD = (b: string, me: string): string =>
  `(${me}.system = 1 OR ${b}.owner_id = ${me}.id OR EXISTS (
     SELECT 1 FROM board_shares s WHERE s.board_id = ${b}.id AND ${SHARED_WITH("s", me)}))`;

/** The condition, in SQL, under which account "me" sees view "v". */
export const SEES_VIEW = (v: string, me: string): string =>
  `(${me}.system = 1 OR ${v}.owner_id = ${me}.id OR EXISTS (
     SELECT 1 FROM boards vb WHERE vb.view_id = ${v}.id AND ${SEES_BOARD("vb", me)}))`;

const levels = selection<{ level: ShareLevel }>(
  `SELECT s.level FROM board_shares s JOIN users me ON me.id = ?
   WHERE s.board_id = ? AND ${SHARED_WITH("s", "me")}`,
);

interface ShareRow {
  board_id: Id;
  principal_type: "user" | "group";
  principal_id: string;
  principal_name: string;
  principal_email: string;
  level: ShareLevel;
}

const ofView = selection<ShareRow>(
  `SELECT s.* FROM board_shares s JOIN boards b ON b.id = s.board_id
   WHERE b.view_id = ? ORDER BY s.principal_type DESC, s.principal_name, b.position, b.id`,
);
const removeOfView = mutation(
  "DELETE FROM board_shares WHERE board_id IN (SELECT id FROM boards WHERE view_id = ?)",
);
const insertShare = mutation(
  `INSERT OR REPLACE INTO board_shares
     (board_id, principal_type, principal_id, principal_name, principal_email, level)
   VALUES (?, ?, ?, ?, ?, ?)`,
);

/** Whom a workspace's views can be shared with: the users and groups with access to it. */
const principalsOf = selection<EntraPrincipal>(
  `SELECT principal_type AS type, principal_id AS id, principal_name AS name,
     principal_email AS email
   FROM principal_permissions WHERE workspace_id = ? ORDER BY principal_type DESC, principal_name`,
);

/** The users and groups a view's boards went to, each with its boards and their level. */
export type ViewShareList = PrincipalPermissions<ViewSharePermissions>[];

export const boardShares = {
  principals: (workspaceId: Id): EntraPrincipal[] => principalsOf.all(workspaceId),
  /** Grouped by user or group, in the order of their names. */
  ofView: (viewId: Id): ViewShareList => {
    const byPrincipal = new Map<string, ViewShareList[number]>();
    for (const row of ofView.all(viewId)) {
      const key = `${row.principal_type}:${row.principal_id}`;
      const entry = byPrincipal.get(key) ?? {
        principal: {
          type: row.principal_type,
          id: row.principal_id,
          name: row.principal_name,
          email: row.principal_email,
        },
        permissions: {},
      };
      entry.permissions[String(row.board_id)] = row.level;
      byPrincipal.set(key, entry);
    }
    return [...byPrincipal.values()];
  },
  /** A view's sharing, replaced as a whole. */
  replaceOfView: transaction((viewId: Id, shares: ViewShareList): void => {
    removeOfView.run(viewId);
    for (const { principal, permissions } of shares) {
      for (const [boardId, level] of Object.entries(permissions)) {
        insertShare.run(
          Number(boardId),
          principal.type,
          principal.id,
          principal.name,
          principal.email,
          level,
        );
      }
    }
  }),
};

/**
 * What this account may do with this board: it owns it, or holds the widest
 * of the shares that designate it — itself or one of its groups. Null: it
 * does not see it.
 */
export const boardAccess = (
  board: { id: Id; owner_id: Id | null },
  user: UserRow,
): BoardAccess | null => {
  if (user.system || board.owner_id === user.id) return "owner";
  const held = levels.all(user.id, board.id).map((l) => l.level);
  if (held.includes("full")) return "full";
  return held.length > 0 ? "read" : null;
};

/** Does this account own this view — or is it the "admin" account? */
export const ownsView = (view: { owner_id: Id | null }, user: UserRow): boolean =>
  Boolean(user.system) || view.owner_id === user.id;
