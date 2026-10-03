// Les listes d'un tableau (ses colonnes) et leur réordonnancement.

import { Router } from "express";
import { isListColor } from "@milo/shared";
import { badRequest, orNotFound, requireText, toIds } from "../lib/http.js";
import { concernes, notifierSuppression } from "../lib/notify.js";
import { now } from "../lib/time.js";
import { touch, touchNow } from "../middleware/events.js";
import { boardOuvert } from "../repositories/boards.js";
import { copyTaskList } from "../repositories/copy-list.js";
import { cleDansLeTableau } from "../repositories/listes.js";
import { transaction } from "../db/query.js";
import { listsWithCards, reorderTaskLists, taskCards, taskLists } from "../repositories/tasks.js";

const LISTE_INTROUVABLE = "Liste introuvable";

export const taskListRoutes = Router();

taskListRoutes.use(touch("task-lists"));

// Les listes appartiennent à un tableau : la requête doit préciser lequel.
taskListRoutes.get("/", (req, res) => {
  const { board } = req.query;
  if (!board) badRequest("Le paramètre board est requis");
  boardOuvert(board, req);
  res.json(listsWithCards(board));
});

taskListRoutes.post("/", (req, res) => {
  const name = requireText(req.body.name, "Le nom de la liste est requis");
  const boardId = req.body.board_id;
  if (!boardId) badRequest("Le tableau est requis");
  boardOuvert(boardId, req, "create");

  // Nouvelle liste ajoutée à la fin de celles de ce tableau, ou au rang
  // demandé : le « + » entre deux listes l'y glisse.
  const { next } = taskLists.nextPosition(boardId);
  // Dans le widget « Tâches » d'où elle est créée, à défaut le premier.
  const cle = cleDansLeTableau(Number(boardId), "task.list", req.body.list_key);
  const { lastInsertRowid } = taskLists.create.run(boardId, name, next, cle, now());
  const id = Number(lastInsertRowid);
  const rang = Number(req.body.index);
  if (req.body.index !== undefined && Number.isInteger(rang) && rang >= 0) {
    const autres = taskLists.ofBoard
      .all(boardId)
      .map((l) => l.id)
      .filter((autre) => autre !== id);
    reorderTaskLists([...autres.slice(0, rang), id, ...autres.slice(rang)]);
  }
  res.status(201).json({ ...taskLists.byId.get(id), cards: [] });
});

// Réordonnancement complet. Déclaré avant « /:id », sinon « reorder » serait
// interprété comme un identifiant.
taskListRoutes.put("/reorder", (req, res) => {
  const { ids, board_id } = req.body;
  if (!Array.isArray(ids)) badRequest("ids doit être un tableau");
  if (!board_id) badRequest("Le tableau est requis");
  const board = boardOuvert(board_id, req, "update");

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
  // Copier ajoute une liste au tableau d'accueil ; le tableau de départ, lui,
  // n'en perd rien.
  boardOuvert(existing.board_id, req);
  const cible = boardOuvert(boardId, req, "create");

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
  // Changer de tableau, c'est ajouter la liste à celui d'accueil.
  boardOuvert(existing.board_id, req, "update");
  boardOuvert(
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
    const cle = change
      ? cleDansLeTableau(Number(boardId), "task.list", undefined)
      : existing.list_key;
    taskLists.update.run(boardId, name, position, color, cle, existing.id);
    if (change) taskCards.recontextualiser.run(boardId, existing.id);
  })();
  res.json(taskLists.byId.get(existing.id));
});

// Vider une liste de ses tâches, la liste et ses séparateurs restant en place.
taskListRoutes.delete("/:id/cards", (req, res) => {
  const existing = orNotFound(taskLists.byId.get(req.params.id), LISTE_INTROUVABLE);
  boardOuvert(existing.board_id, req, "delete");
  const destinataires = concernes.liste(existing.id);
  taskCards.removeTasksOfList.run(existing.id);
  notifierSuppression({
    kind: "card",
    targetId: existing.id,
    titre: existing.name,
    message: "a supprimé les tâches de la liste",
    auteur: req.user,
    destinataires,
    disparu: true,
  });
  res.status(204).end();
});

taskListRoutes.delete("/:id", (req, res) => {
  const existing = orNotFound(taskLists.byId.get(req.params.id), LISTE_INTROUVABLE);
  boardOuvert(existing.board_id, req, "delete");
  const destinataires = concernes.liste(existing.id);
  taskLists.remove.run(existing.id);
  notifierSuppression({
    kind: "card",
    targetId: existing.id,
    titre: existing.name,
    message: "a supprimé la liste",
    auteur: req.user,
    destinataires,
    disparu: true,
  });
  res.status(204).end();
});
