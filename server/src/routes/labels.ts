// Labels: those of a task board, set on its cards, and their twins of a
// project board, set on its projects. Same rules, two tables: the two modes
// do not share their labels.
//
// One router serves both. They used to be two twin blocks of code in the old
// file; since both kinds of boards can be private, only the table being
// queried still tells them apart.

import { Router } from "express";
import type { Request } from "express";
import type { CopyResult, Id, Resource, Right } from "@milo/shared";
import { DEFAULT_LABEL_COLOR, isLabelColor } from "@milo/shared";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type { LabelRow, NextRow } from "../db/rows.js";
import { require } from "../lib/rights.js";
import { badRequest, orNotFound, refuseIfUsed, requireText } from "../lib/http.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { openTaskBoard } from "../repositories/boards.js";
import { openBoard } from "../repositories/boards.js";
import { receivedOrder, arrangeLabels, arrangeProjectLabels } from "../repositories/reorder.js";

const LABEL_NOT_FOUND = "Étiquette introuvable";

interface LabelTable {
  /** The table name. It only enters the SQL here, never from a request. */
  table: "labels" | "project_labels";
  /** What the event stream must signal when these labels change. */
  touched: Resource[];
  /**
   * The board that carries these labels, if it is open to this person.
   * Throws otherwise, and returns the verified id — the copy needs both
   * sides, and doesn't want an id received as is.
   */
  verifyBoard: (boardId: unknown, req: Request, right: Right) => Id;
  /** True when these labels carry a weight: project labels only. */
  withWeight?: boolean;
  /** The table's arrangement, board by board (repositories/reorder.ts). */
  store: (ids: Id[], boardId: Id) => void;
}

/** The received weight: an integer, positive or not. */
const labelWeight = (value: unknown): number => {
  const weight = Number(value);
  if (!Number.isInteger(weight)) badRequest("Le poids doit être un nombre entier");
  return weight;
};

const createRoutes = ({
  table,
  touched,
  verifyBoard,
  withWeight = false,
  store,
}: LabelTable): Router => {
  const byId = selection<LabelRow>(`SELECT * FROM ${table} WHERE id = ?`);
  const ofBoard = selection<LabelRow>(
    `SELECT * FROM ${table} WHERE board_id = ? ORDER BY position, id`,
  );
  const nextRank = scalar<NextRow>(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM ${table} WHERE board_id = ?`,
  );
  // Without a weight, the column does not exist: we only write what the table carries.
  const insertion = mutation(
    withWeight
      ? `INSERT INTO ${table} (board_id, name, color, position, created_at, weight) VALUES (?, ?, ?, ?, ?, ?)`
      : `INSERT INTO ${table} (board_id, name, color, position, created_at) VALUES (?, ?, ?, ?, ?)`,
  );
  const create = {
    run: (boardId: unknown, name: string, color: string, rank: number, instant: string, weight = 0) =>
      withWeight
        ? insertion.run(boardId, name, color, rank, instant, weight)
        : insertion.run(boardId, name, color, rank, instant),
  };
  const updatedAt = mutation(
    withWeight
      ? `UPDATE ${table} SET name = ?, color = ?, weight = ? WHERE id = ?`
      : `UPDATE ${table} SET name = ?, color = ? WHERE id = ?`,
  );
  const updateStatement = {
    run: (name: string, color: string, weight: number, id: Id) =>
      withWeight ? updatedAt.run(name, color, weight, id) : updatedAt.run(name, color, id),
  };
  const withSameName = selection<LabelRow>(
    `SELECT * FROM ${table} WHERE board_id = ? AND name = ? COLLATE NOCASE LIMIT 1`,
  );
  const remove = mutation(`DELETE FROM ${table} WHERE id = ?`);
  // What carries the label: cards, or projects.
  const uses = scalar<{ count: number }>(
    table === "labels"
      ? "SELECT COUNT(*) AS count FROM card_labels WHERE label_id = ?"
      : "SELECT COUNT(*) AS count FROM project_label_links WHERE label_id = ?",
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
    const timestamp = now();
    let rank = nextRank(target).next;
    let copied = 0;
    let skipped = 0;

    for (const label of ofBoard.all(source)) {
      if (withSameName.get(target, label.name)) {
        skipped += 1;
        continue;
      }
      create.run(target, label.name, label.color, rank, timestamp, label.weight ?? 0);
      rank += 1;
      copied += 1;
    }

    return { copied, skipped, removed };
  });

  const routes = Router();
  routes.use(touch(...touched));

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
    verifyBoard(boardId, req, "create");
    const weight = labelWeight(req.body.weight ?? 0);

    const { next } = nextRank(boardId);
    const { lastInsertRowid } = create.run(boardId, name, color, next, now(), weight);
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

    res.json(copy(source, target, replaceExisting));
  });

  // The order of a board's labels, dragged in the widget's drawer: it names
  // all those of the board, each once. Declared before "/:id".
  routes.put("/reorder", (req, res) => {
    const boardId = verifyBoard(req.body.board_id, req, "update");
    const ids = receivedOrder(req.body.ids, ofBoard.all(boardId), "L'ordre doit nommer toutes les étiquettes");
    store(ids, boardId);
    res.json(ofBoard.all(boardId));
  });

  routes.put("/:id", (req, res) => {
    const existing = orNotFound(byId.get(req.params.id), LABEL_NOT_FOUND);
    verifyBoard(existing.board_id, req, "update");

    const name = requireText(req.body.name ?? existing.name, "Le nom de l'étiquette est requis");
    const color = req.body.color ?? existing.color;
    if (!isLabelColor(color)) badRequest("Couleur inconnue");
    const weight = labelWeight(req.body.weight ?? existing.weight ?? 0);

    updateStatement.run(name, color, weight, existing.id);
    res.json(byId.get(existing.id));
  });

  routes.delete("/:id", (req, res) => {
    const existing = orNotFound(byId.get(req.params.id), LABEL_NOT_FOUND);
    verifyBoard(existing.board_id, req, "delete");
    refuseIfUsed(existing.name, uses(existing.id).count);

    remove.run(existing.id);
    res.status(204).end();
  });

  return routes;
};

/** Labels of a task board: it can be private. */
export const labelRoutes = createRoutes({
  table: "labels",
  // Cards carry their labels: the board is re-read with them.
  touched: ["labels", "task-lists"],
  verifyBoard: (boardId, req, right) => openTaskBoard(boardId, req, right).id,
  store: arrangeLabels,
});

/** Labels of a project board: it can be private too. */
export const projectLabelRoutes = createRoutes({
  table: "project_labels",
  touched: ["project-labels", "projects"],
  // The project board belongs to no company: its labels follow the Projects
  // mode's rights in any of them.
  verifyBoard: (boardId, req, right) => {
    require(req, "projects", right);
    return openBoard(boardId, req.user).id;
  },
  withWeight: true,
  store: arrangeProjectLabels,
});
