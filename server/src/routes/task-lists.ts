// The lists of a board (its columns) and their reordering.

import { Router } from "express";
import { isListColor } from "@milo/shared";
import { badRequest, orNotFound, requireText, toIds } from "../lib/http.js";
import { concerned, notifyDeletion } from "../lib/notify.js";
import { now } from "../lib/time.js";
import { touch, touchNow } from "../middleware/events.js";
import { openTaskBoard } from "../repositories/boards.js";
import { copyTaskList } from "../repositories/copy-list.js";
import { keyInBoard } from "../repositories/lists.js";
import { transaction } from "../db/query.js";
import { listsWithCards, reorderTaskLists, taskCards, taskLists } from "../repositories/tasks.js";

const LIST_NOT_FOUND = "Liste introuvable";

export const taskListRoutes = Router();

taskListRoutes.use(touch("task-lists"));

// Lists belong to a board: the request must specify which.
taskListRoutes.get("/", (req, res) => {
  const { board } = req.query;
  if (!board) badRequest("Le paramètre board est requis");
  openTaskBoard(board, req);
  res.json(listsWithCards(board));
});

taskListRoutes.post("/", (req, res) => {
  const name = requireText(req.body.name, "Le nom de la liste est requis");
  const boardId = req.body.board_id;
  if (!boardId) badRequest("Le tableau est requis");
  openTaskBoard(boardId, req, "create");

  // New list added at the end of those of this board, or at the requested
  // position: the "+" between two lists slips it in there.
  const { next } = taskLists.nextPosition(boardId);
  // In the "Tâches" widget it is created from, otherwise the first one.
  const key = keyInBoard(Number(boardId), "task.list", req.body.list_key);
  const { lastInsertRowid } = taskLists.create.run(boardId, name, next, key, now());
  const id = Number(lastInsertRowid);
  const rank = Number(req.body.index);
  if (req.body.index !== undefined && Number.isInteger(rank) && rank >= 0) {
    const others = taskLists.ofBoard
      .all(boardId)
      .map((l) => l.id)
      .filter((other) => other !== id);
    reorderTaskLists([...others.slice(0, rank), id, ...others.slice(rank)]);
  }
  res.status(201).json({ ...taskLists.byId.get(id), cards: [] });
});

// Full reordering. Declared before "/:id", otherwise "reorder" would be
// interpreted as an id.
taskListRoutes.put("/reorder", (req, res) => {
  const { ids, board_id } = req.body;
  if (!Array.isArray(ids)) badRequest("ids doit être un tableau");
  if (!board_id) badRequest("Le tableau est requis");
  const board = openTaskBoard(board_id, req, "update");

  // The order sent must cover exactly the lists of this board.
  const known = new Set(taskLists.idsOfBoard.all(board.id).map((l) => l.id));
  const order = toIds(ids);
  if (order.length !== known.size || order.some((id) => !known.has(id))) {
    badRequest("La liste des identifiants ne correspond pas aux listes de ce tableau");
  }

  reorderTaskLists(order);
  res.json(listsWithCards(board.id));
});

/**
 * Copy a list, with its cards and everything they carry. The copy goes
 * into the requested board — which may be the original's — and is placed at
 * the end. Declared before "/:id": otherwise ":id/copy" would be taken for an
 * id.
 */
taskListRoutes.post("/:id/copy", (req, res) => {
  const existing = orNotFound(taskLists.byId.get(req.params.id), LIST_NOT_FOUND);
  const name = requireText(req.body.name ?? existing.name, "Le nom de la liste est requis");
  const boardId = req.body.board_id ?? existing.board_id;

  // Both the source board and the destination board must be open to this
  // person: a list does not leave a board one does not see, nor enter one.
  // Copying adds a list to the destination board; the source board,
  // loses nothing.
  openTaskBoard(existing.board_id, req);
  const target = openTaskBoard(boardId, req, "create");

  // Copying to another board may create the labels that were missing there:
  // the client must reread them, otherwise the cards would arrive with
  // labels it does not know yet.
  if (target.id !== existing.board_id) touchNow(res, "labels");

  const copy = copyTaskList({
    sourceId: existing.id,
    boardId: target.id,
    name,
    color: existing.color,
    userId: req.user.id,
  });

  res.status(201).json({ ...taskLists.byId.get(copy), cards: [] });
});

taskListRoutes.put("/:id", (req, res) => {
  const existing = orNotFound(taskLists.byId.get(req.params.id), LIST_NOT_FOUND);
  const name = requireText(req.body.name ?? existing.name, "Le nom de la liste est requis");
  const color = req.body.color ?? existing.color ?? "";
  if (!isListColor(color)) badRequest("Couleur inconnue");

  // Board change: the list takes its cards along and is placed at the end
  // of the destination board, like a list just created there.
  const boardId = req.body.board_id ?? existing.board_id;
  // Both the source board and the destination board must be open to this
  // person: a list does not leave a board one does not see, nor enter one.
  // Changing board means adding the list to the destination one.
  openTaskBoard(existing.board_id, req, "update");
  openTaskBoard(
    boardId,
    req,
    Number(boardId) !== existing.board_id ? "create" : "update",
  );

  const change = Number(boardId) !== existing.board_id;
  const position = change
    ? taskLists.nextPosition(boardId).next
    : (req.body.position ?? existing.position);

  transaction(() => {
    // In another board, it goes to its first "Tâches" widget.
    const key = change
      ? keyInBoard(Number(boardId), "task.list", undefined)
      : existing.list_key;
    taskLists.update.run(boardId, name, position, color, key, existing.id);
    if (change) taskCards.reassignContext.run(boardId, existing.id);
  })();
  res.json(taskLists.byId.get(existing.id));
});

// Empty a list of its tasks, the list and its separators staying in place.
taskListRoutes.delete("/:id/cards", (req, res) => {
  const existing = orNotFound(taskLists.byId.get(req.params.id), LIST_NOT_FOUND);
  openTaskBoard(existing.board_id, req, "delete");
  const recipients = concerned.list(existing.id);
  taskCards.removeTasksOfList.run(existing.id);
  notifyDeletion({
    kind: "card",
    targetId: existing.id,
    title: existing.name,
    message: "a supprimé les tâches de la liste",
    author: req.user,
    recipients,
    vanished: true,
  });
  res.status(204).end();
});

taskListRoutes.delete("/:id", (req, res) => {
  const existing = orNotFound(taskLists.byId.get(req.params.id), LIST_NOT_FOUND);
  openTaskBoard(existing.board_id, req, "delete");
  const recipients = concerned.list(existing.id);
  taskLists.remove.run(existing.id);
  notifyDeletion({
    kind: "card",
    targetId: existing.id,
    title: existing.name,
    message: "a supprimé la liste",
    author: req.user,
    recipients,
    vanished: true,
  });
  res.status(204).end();
});
