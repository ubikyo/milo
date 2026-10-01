// Les listes d'un tableau (ses colonnes) et leur réordonnancement.

import { Router } from "express";
import { isListColor } from "@milo/shared";
import { badRequest, orNotFound, requireText, toIds } from "../lib/http.js";
import { concernes, notifierSuppression } from "../lib/notify.js";
import { now } from "../lib/time.js";
import { touch, touchNow } from "../middleware/events.js";
import { boardOuvert, listesLibres } from "../repositories/boards.js";
import { copyTaskList } from "../repositories/copy-list.js";
import { listsWithCards, reorderTaskLists, taskCards, taskLists } from "../repositories/tasks.js";

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
  listesLibres(boardOuvert(boardId, req.user));

  // Nouvelle liste ajoutée à la fin de celles de ce tableau, ou au rang
  // demandé : le « + » entre deux listes l'y glisse.
  const { next } = taskLists.nextPosition(boardId);
  const { lastInsertRowid } = taskLists.create.run(boardId, name, next, now());
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
  const board = listesLibres(boardOuvert(board_id, req.user));

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
  // Copier ajoute une liste au tableau d'accueil : il ne doit pas être
  // verrouillé. Le tableau de départ, lui, n'en perd rien.
  boardOuvert(existing.board_id, req.user);
  const cible = listesLibres(boardOuvert(boardId, req.user));

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
  const depart = boardOuvert(existing.board_id, req.user);
  const accueil = boardOuvert(boardId, req.user);

  // Changer de tableau retire une liste à l'un et l'ajoute à l'autre : ni
  // l'un ni l'autre ne doit être verrouillé. Renommer ou colorer reste permis.
  const change = Number(boardId) !== existing.board_id;
  if (change) {
    listesLibres(depart);
    listesLibres(accueil);
  }
  const position = change
    ? taskLists.nextPosition(boardId).next
    : (req.body.position ?? existing.position);

  taskLists.update.run(boardId, name, position, color, existing.id);
  res.json(taskLists.byId.get(existing.id));
});

// Vider une liste de ses tâches, la liste et ses séparateurs restant en place.
taskListRoutes.delete("/:id/cards", (req, res) => {
  const existing = orNotFound(taskLists.byId.get(req.params.id), LISTE_INTROUVABLE);
  boardOuvert(existing.board_id, req.user);
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
  listesLibres(boardOuvert(existing.board_id, req.user));
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
