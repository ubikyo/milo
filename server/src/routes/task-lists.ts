// Les listes d'un tableau (ses colonnes) et leur réordonnancement.

import { Router } from "express";
import { isListColor } from "@milo/shared";
import { badRequest, orNotFound, requireText, toIds } from "../lib/http.js";
import { concerned, notifyDeletion } from "../lib/notify.js";
import { now } from "../lib/time.js";
import { touch, touchNow } from "../middleware/events.js";
import { openTaskBoard } from "../repositories/boards.js";
import { copyTaskList } from "../repositories/copy-list.js";
import { keyInBoard } from "../repositories/listes.js";
import { transaction } from "../db/query.js";
import { listsWithCards, reorderTaskLists, taskCards, taskLists } from "../repositories/tasks.js";

const LIST_NOT_FOUND = "Liste introuvable";

export const taskListRoutes = Router();

taskListRoutes.use(touch("task-lists"));

// Les listes appartiennent à un tableau : la requête doit préciser lequel.
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

  // Nouvelle liste ajoutée à la fin de celles de ce tableau, ou au rang
  // demandé : le « + » entre deux listes l'y glisse.
  const { next } = taskLists.nextPosition(boardId);
  // Dans le widget « Tâches » d'où elle est créée, à défaut le premier.
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

// Réordonnancement complet. Déclaré avant « /:id », sinon « reorder » serait
// interprété comme un identifiant.
taskListRoutes.put("/reorder", (req, res) => {
  const { ids, board_id } = req.body;
  if (!Array.isArray(ids)) badRequest("ids doit être un tableau");
  if (!board_id) badRequest("Le tableau est requis");
  const board = openTaskBoard(board_id, req, "update");

  // L'ordre envoyé doit couvrir exactement les listes de ce tableau.
  const known = new Set(taskLists.idsOfBoard.all(board.id).map((l) => l.id));
  const order = toIds(ids);
  if (order.length !== known.size || order.some((id) => !known.has(id))) {
    badRequest("La liste des identifiants ne correspond pas aux listes de ce tableau");
  }

  reorderTaskLists(order);
  res.json(listsWithCards(board.id));
});

/**
 * Copier une liste, avec ses cartes et tout ce qu'elles portent. La copie va
 * dans le tableau demandé — qui peut être celui de l'original — et s'y range à
 * la fin. Déclaré avant « /:id » : sans cela « :id/copy » serait pris pour un
 * identifiant.
 */
taskListRoutes.post("/:id/copy", (req, res) => {
  const existing = orNotFound(taskLists.byId.get(req.params.id), LIST_NOT_FOUND);
  const name = requireText(req.body.name ?? existing.name, "Le nom de la liste est requis");
  const boardId = req.body.board_id ?? existing.board_id;

  // Le tableau de départ comme celui d'accueil doivent être ouverts à cette
  // personne : une liste ne sort pas d'un tableau privé, et n'y entre pas.
  // Copier ajoute une liste au tableau d'accueil ; le tableau de départ, lui,
  // n'en perd rien.
  openTaskBoard(existing.board_id, req);
  const target = openTaskBoard(boardId, req, "create");

  // Copier vers un autre tableau peut y créer les étiquettes qui manquaient :
  // le client doit les relire, sans quoi les cartes arriveraient avec des
  // étiquettes qu'il ne connaît pas encore.
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

  // Changement de tableau : la liste emporte ses cartes et se range à la fin
  // du tableau d'accueil, comme une liste qu'on viendrait d'y créer.
  const boardId = req.body.board_id ?? existing.board_id;
  // Le tableau de départ comme celui d'accueil doivent être ouverts à cette
  // personne : une liste ne sort pas d'un tableau privé, et n'y entre pas.
  // Changer de tableau, c'est ajouter la liste à celui d'accueil.
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
    // Dans un autre tableau, elle va à son premier widget « Tâches ».
    const key = change
      ? keyInBoard(Number(boardId), "task.list", undefined)
      : existing.list_key;
    taskLists.update.run(boardId, name, position, color, key, existing.id);
    if (change) taskCards.reassignContext.run(boardId, existing.id);
  })();
  res.json(taskLists.byId.get(existing.id));
});

// Vider une liste de ses tâches, la liste et ses séparateurs restant en place.
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
