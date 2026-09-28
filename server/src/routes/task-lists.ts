// Les listes d'un tableau (ses colonnes) et leur réordonnancement.

import { Router } from "express";
import { isListColor } from "@milo/shared";
import { badRequest, orNotFound, requireText, toIds } from "../lib/http.js";
import { now } from "../lib/time.js";
import { touch, touchNow } from "../middleware/events.js";
import { boardOuvert } from "../repositories/boards.js";
import { copyTaskList } from "../repositories/copy-list.js";
import { listsWithCards, reorderTaskLists, taskLists } from "../repositories/tasks.js";

const LISTE_INTROUVABLE = "Liste introuvable";

export const taskListRoutes = Router();

taskListRoutes.use(touch("task-lists"));

// Les listes appartiennent à un tableau : la requête doit préciser lequel.
taskListRoutes.get("/", (req, res) => {
  const { board } = req.query;
  if (!board) badRequest("Le paramètre board est requis");
  boardOuvert(board, req.user);
  res.json(listsWithCards(board));
});

taskListRoutes.post("/", (req, res) => {
  const name = requireText(req.body.name, "Le nom de la liste est requis");
  const boardId = req.body.board_id;
  if (!boardId) badRequest("Le tableau est requis");
  boardOuvert(boardId, req.user);

  // Nouvelle liste ajoutée à la fin de celles de ce tableau.
  const { next } = taskLists.nextPosition(boardId);
  const { lastInsertRowid } = taskLists.create.run(boardId, name, next, now());
  res.status(201).json({ ...taskLists.byId.get(lastInsertRowid), cards: [] });
});

// Réordonnancement complet. Déclaré avant « /:id », sinon « reorder » serait
// interprété comme un identifiant.
taskListRoutes.put("/reorder", (req, res) => {
  const { ids, board_id } = req.body;
  if (!Array.isArray(ids)) badRequest("ids doit être un tableau");
  if (!board_id) badRequest("Le tableau est requis");
  const board = boardOuvert(board_id, req.user);

  // L'ordre envoyé doit couvrir exactement les listes de ce tableau.
  const connues = new Set(taskLists.idsOfBoard.all(board.id).map((l) => l.id));
  const ordre = toIds(ids);
  if (ordre.length !== connues.size || ordre.some((id) => !connues.has(id))) {
    badRequest("La liste des identifiants ne correspond pas aux listes de ce tableau");
  }

  reorderTaskLists(ordre);
  res.json(listsWithCards(board.id));
});

/**
 * Copier une liste, avec ses cartes et tout ce qu'elles portent. La copie va
 * dans le tableau demandé — qui peut être celui de l'original — et s'y range à
 * la fin. Déclaré avant « /:id » : sans cela « :id/copy » serait pris pour un
 * identifiant.
 */
taskListRoutes.post("/:id/copy", (req, res) => {
  const existing = orNotFound(taskLists.byId.get(req.params.id), LISTE_INTROUVABLE);
  const name = requireText(req.body.name ?? existing.name, "Le nom de la liste est requis");
  const boardId = req.body.board_id ?? existing.board_id;

  // Le tableau de départ comme celui d'accueil doivent être ouverts à cette
  // personne : une liste ne sort pas d'un tableau privé, et n'y entre pas.
  boardOuvert(existing.board_id, req.user);
  const cible = boardOuvert(boardId, req.user);

  // Copier vers un autre tableau peut y créer les étiquettes qui manquaient :
  // le client doit les relire, sans quoi les cartes arriveraient avec des
  // étiquettes qu'il ne connaît pas encore.
  if (cible.id !== existing.board_id) touchNow(res, "labels");

  const copie = copyTaskList({
    sourceId: existing.id,
    boardId: cible.id,
    name,
    color: existing.color,
    userId: req.user.id,
  });

  res.status(201).json({ ...taskLists.byId.get(copie), cards: [] });
});

taskListRoutes.put("/:id", (req, res) => {
  const existing = orNotFound(taskLists.byId.get(req.params.id), LISTE_INTROUVABLE);
  const name = requireText(req.body.name ?? existing.name, "Le nom de la liste est requis");
  const color = req.body.color ?? existing.color ?? "";
  if (!isListColor(color)) badRequest("Couleur inconnue");

  // Changement de tableau : la liste emporte ses cartes et se range à la fin
  // du tableau d'accueil, comme une liste qu'on viendrait d'y créer.
  const boardId = req.body.board_id ?? existing.board_id;
  // Le tableau de départ comme celui d'accueil doivent être ouverts à cette
  // personne : une liste ne sort pas d'un tableau privé, et n'y entre pas.
  boardOuvert(existing.board_id, req.user);
  boardOuvert(boardId, req.user);

  const change = Number(boardId) !== existing.board_id;
  const position = change
    ? taskLists.nextPosition(boardId).next
    : (req.body.position ?? existing.position);

  taskLists.update.run(boardId, name, position, color, existing.id);
  res.json(taskLists.byId.get(existing.id));
});

taskListRoutes.delete("/:id", (req, res) => {
  const existing = orNotFound(taskLists.byId.get(req.params.id), LISTE_INTROUVABLE);
  boardOuvert(existing.board_id, req.user);
  taskLists.remove.run(existing.id);
  res.status(204).end();
});
