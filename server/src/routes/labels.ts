// Labels: those of a task board, set on its cards, their twins of a project
// board, set on its projects, and of a Support board, set on its requests, and
// those of a board's assets, which name the GLPI tags of its machines. Same
// rules, four tables: the modes do not share their labels. Labels are a board's contexts (repositories/contexts.ts): any
// change re-reads the boards.
//
// One router serves both. They used to be two twin blocks of code in the old
// file; since both kinds of boards can be out of sight, only the table being
// queried still tells them apart.

import { Router } from "express";
import type { Request } from "express";
import type { CopyResult, Id, Resource, Right, WidgetAccess } from "@milo/shared";
import {
  DEFAULT_LABEL_COLOR,
  DEFAULT_LABEL_GROUP,
  accessIncludes,
  isLabelColor,
} from "@milo/shared";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type { LabelRow, NextRow } from "../db/rows.js";
import { require } from "../lib/rights.js";
import { widgetRights } from "../repositories/users.js";
import { HttpError, badRequest, orNotFound, refuseIfUsed, requireText } from "../lib/http.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { openTaskBoard } from "../repositories/boards.js";
import { openBoard } from "../repositories/boards.js";
import {
  assetLabelGroups,
  boardLabelGroups,
  projectLabelGroups,
  supportLabelGroups,
} from "../repositories/label-groups.js";
import { reassignWorkstations } from "../repositories/assets.js";
import type { LabelGroupStore } from "../repositories/label-groups.js";
import { mountLabelGroups } from "./label-groups.js";

const LABEL_NOT_FOUND = "Étiquette introuvable";

const GROUP_TABLES = {
  labels: "label_groups",
  project_labels: "project_label_groups",
  asset_labels: "asset_label_groups",
  support_labels: "support_label_groups",
} as const;

interface LabelTable {
  /** The table name. It only enters the SQL here, never from a request. */
  table: "labels" | "project_labels" | "asset_labels" | "support_labels";
  /** What the event stream must signal when these labels change. */
  touched: Resource[];
  /**
   * The board that carries these labels, if it is open to this person.
   * Throws otherwise, and returns the verified id — the copy needs both
   * sides, and doesn't want an id received as is.
   */
  verifyBoard: (boardId: unknown, req: Request, right: Right) => Id;
  /** The groups of these labels (repositories/label-groups.ts). */
  groups: LabelGroupStore;
  /** What follows a change of these labels, once written. */
  changed?: () => void;
}

const createRoutes = ({
  table,
  touched,
  verifyBoard,
  groups,
  changed = () => undefined,
}: LabelTable): Router => {
  const groupTable = GROUP_TABLES[table];
  // With the name of their group: the lists title them by it.
  const byId = selection<LabelRow>(
    `SELECT l.*, g.name AS group_name FROM ${table} l
     LEFT JOIN ${groupTable} g ON g.id = l.group_id WHERE l.id = ?`,
  );
  const ofBoard = selection<LabelRow>(
    `SELECT l.*, g.name AS group_name FROM ${table} l
     LEFT JOIN ${groupTable} g ON g.id = l.group_id
     WHERE l.board_id = ? ORDER BY l.position, l.id`,
  );
  const nextRank = scalar<NextRow>(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM ${table} WHERE board_id = ?`,
  );
  // Put last on the board, the label then takes its place at the end of its
  // group when positions are renumbered.
  const create = mutation(
    `INSERT INTO ${table} (board_id, group_id, name, color, position, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const updateStatement = mutation(`UPDATE ${table} SET name = ?, color = ? WHERE id = ?`);
  // The label rewritten, and moved to the end of its new group if it changes.
  const update = transaction(
    (
      existing: LabelRow,
      { name, color, group }: { name: string; color: string; group: Id },
    ) => {
      updateStatement.run(name, color, existing.id);
      if (group !== existing.group_id) groups.moveTo(existing.id, group, existing.board_id);
    },
  );
  const withSameName = selection<LabelRow>(
    `SELECT * FROM ${table} WHERE board_id = ? AND name = ? COLLATE NOCASE LIMIT 1`,
  );
  const remove = mutation(`DELETE FROM ${table} WHERE id = ?`);
  // What carries the label: cards, projects, or requests. An asset label is
  // carried by no link: it only names a tag, and may always go.
  const uses = scalar<{ count: number }>(
    table === "labels"
      ? "SELECT COUNT(*) AS count FROM card_labels WHERE label_id = ?"
      : table === "project_labels"
        ? "SELECT COUNT(*) AS count FROM project_label_links WHERE label_id = ?"
        : table === "support_labels"
          ? "SELECT COUNT(*) AS count FROM support_request_labels WHERE label_id = ?"
          : "SELECT 0 AS count",
  );

  const clearFromBoard = mutation(`DELETE FROM ${table} WHERE board_id = ?`);

  /**
   * The labels of one board set on another. Those already bearing the same
   * name there are not duplicated, whatever their color: two labels with the
   * same name could no longer be told apart in a list. The others are put
   * after those of the destination. "replace": the destination's go first —
   * and leave whatever carried them.
   */
  const copy = transaction((source: Id, target: Id, replaceExisting: boolean): CopyResult => {
    const removed = replaceExisting ? clearFromBoard.run(target).changes : 0;
    if (replaceExisting) groups.clear(target);
    const timestamp = now();
    let rank = nextRank(target).next;
    let copied = 0;
    let skipped = 0;

    // Each label goes into the group of the same name, created if needed: read
    // in group order, the groups arrive in the source's order.
    for (const label of ofBoard.all(source)) {
      if (withSameName.get(target, label.name)) {
        skipped += 1;
        continue;
      }
      const group = groups.named(target, label.group_name ?? DEFAULT_LABEL_GROUP);
      create.run(target, group, label.name, label.color, rank, timestamp);
      rank += 1;
      copied += 1;
    }
    groups.renumber(target);

    return { copied, skipped, removed };
  });

  const routes = Router();
  routes.use(touch("boards", ...touched));
  mountLabelGroups(routes, groups, (req, boardId, right) => verifyBoard(boardId, req, right));

  routes.get("/", (req, res) => {
    const { board } = req.query;
    if (!board) badRequest("Le paramètre board est requis");
    verifyBoard(board, req, "view");
    res.json(ofBoard.all(board));
  });

  routes.post("/", (req, res) => {
    const name = requireText(req.body.name, "Le nom de l'étiquette est requis");
    const boardId = req.body.board_id;
    const color = req.body.color || DEFAULT_LABEL_COLOR;
    if (!boardId) badRequest("Le tableau est requis");
    if (!isLabelColor(color)) badRequest("Couleur inconnue");
    const board = verifyBoard(boardId, req, "create");
    const group = groups.groupFor(board, req.body.group_id);

    const { next } = nextRank(board);
    const { lastInsertRowid } = create.run(board, group, name, color, next, now());
    groups.renumber(board);
    changed();
    res.status(201).json(byId.get(lastInsertRowid));
  });

  // Declared before "/:id" is not necessary — the verbs differ —, but the
  // copy reads better next to the creation than at the end of the file.
  routes.post("/copy", (req, res) => {
    const { from_board, to_board } = req.body;
    if (!from_board || !to_board) {
      badRequest("Le tableau d'origine et celui de destination sont requis");
    }

    const replaceExisting = req.body.replace === true;
    const source = verifyBoard(from_board, req, "view");
    const target = verifyBoard(to_board, req, "create");
    // Erasing the destination's means deleting some.
    if (replaceExisting) verifyBoard(to_board, req, "delete");
    if (source === target) badRequest("Choisissez un autre tableau que celui-ci");

    const result = copy(source, target, replaceExisting);
    changed();
    res.json(result);
  });

  routes.put("/:id", (req, res) => {
    const existing = orNotFound(byId.get(req.params.id), LABEL_NOT_FOUND);
    verifyBoard(existing.board_id, req, "update");

    const name = requireText(req.body.name ?? existing.name, "Le nom de l'étiquette est requis");
    const color = req.body.color ?? existing.color;
    if (!isLabelColor(color)) badRequest("Couleur inconnue");

    // Named, its group must be of the same board; the label goes at its end.
    const group =
      req.body.group_id === undefined
        ? existing.group_id
        : groups.groupFor(existing.board_id, req.body.group_id);

    update(existing, { name, color, group });
    changed();
    res.json(byId.get(existing.id));
  });

  routes.delete("/:id", (req, res) => {
    const existing = orNotFound(byId.get(req.params.id), LABEL_NOT_FOUND);
    verifyBoard(existing.board_id, req, "delete");
    refuseIfUsed(existing.name, uses(existing.id).count);

    remove.run(existing.id);
    changed();
    res.status(204).end();
  });

  return routes;
};

/** Labels of a task board: it may not be shared with everyone. */
export const labelRoutes = createRoutes({
  table: "labels",
  // Cards carry their labels: the board is re-read with them.
  touched: ["labels", "task-lists"],
  verifyBoard: (boardId, req, right) => openTaskBoard(boardId, req, right).id,
  groups: boardLabelGroups,
});

/** Labels of a project board: likewise. */
export const projectLabelRoutes = createRoutes({
  table: "project_labels",
  touched: ["project-labels", "projects"],
  // The project board belongs to no company: its labels follow the Projects
  // mode's rights in any of them.
  verifyBoard: (boardId, req, right) => {
    require(req, "projects", right);
    return openBoard(boardId, req.user).id;
  },
  groups: projectLabelGroups,
});

/** Labels of a Support board: they follow the Support mode's rights. */
export const supportLabelRoutes = createRoutes({
  table: "support_labels",
  // Requests carry their labels: they are re-read with them.
  touched: ["support-labels", "support-requests"],
  verifyBoard: (boardId, req, right) => {
    require(req, "support", right);
    return openBoard(boardId, req.user).id;
  },
  groups: supportLabelGroups,
});

/** The permission on the Asset widget type that each right on asset labels needs. */
const ASSET_LABEL_ACCESS: Record<Right, WidgetAccess> = {
  view: "view",
  create: "update",
  update: "update",
  delete: "delete",
};

/**
 * Labels of a board's assets: each brings into the board the machines whose
 * GLPI tag bears its name. The Assets mode is read-only — machines come from
 * the inventory —, but its labels are the board's settings: they follow the
 * permission on the Asset widget type.
 */
export const assetLabelRoutes = createRoutes({
  table: "asset_labels",
  touched: ["assets"],
  verifyBoard: (boardId, req, right) => {
    if (!accessIncludes(widgetRights(req.user).asset, ASSET_LABEL_ACCESS[right])) {
      throw right === "view"
        ? new HttpError(404, "Introuvable")
        : new HttpError(403, "Vous n'avez pas le droit de modifier ici");
    }
    return openBoard(boardId, req.user).id;
  },
  groups: assetLabelGroups,
  // A label renamed, deleted or added changes the machines it brings.
  changed: () => reassignWorkstations(),
});
