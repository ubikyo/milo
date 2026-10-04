// Les tableaux d'une vue : ses onglets. Un tableau contient ses projets et ses
// listes de tâches, et ses sections de widgets (routes/board-widgets.ts). Tout
// ce qu'il montre appartient à l'un de ses contextes (routes/contexts.ts).

import { Router } from "express";
import type { Request } from "express";
import type { Board, Id, LayoutState } from "@milo/shared";
import { mutation, selection, transaction } from "../db/query.js";
import type { BoardRow } from "../db/rows.js";
import { requireOrganize } from "../lib/droits.js";
import { badRequest, requireText } from "../lib/http.js";
import { concerned, notifyDeletion } from "../lib/notify.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { boardSections } from "../repositories/board-widgets.js";
import { followLists } from "./board-widgets.js";
import { boards, openBoard } from "../repositories/boards.js";
import {
  selectedContext,
  contextOf,
  contexts,
} from "../repositories/contexts.js";
import { personalLayouts, boardScope } from "../repositories/layouts.js";
import { receivedOrder } from "../repositories/reorder.js";
import { inOrderOf, userTabOrders } from "../repositories/tab-orders.js";
import { openView } from "../repositories/views.js";

/** Un réglage arrive en booléen ; la base le range en 0 ou 1. */
const flag = (value: unknown, defaultValue: 0 | 1): 0 | 1 =>
  value === undefined ? defaultValue : (Number(Boolean(value)) as 0 | 1);

/** Les tableaux d'une vue se rangent ensemble, compte par compte. */
const viewScope = (viewId: Id) => `boards:${viewId}`;

/**
 * Un tableau tel que ce compte le voit : son « Hérité » et le contexte qu'il
 * regarde sont les siens. Un tableau privé n'a que sa structure publique
 * (repositories/layouts.ts).
 */
export const boardForAccount = (board: BoardRow, userId: Id): Board => ({
  ...board,
  contexts: contexts.ofBoard.all(board.id).map(contextOf),
  context_id: selectedContext(userId, board.id),
  is_locked: 0,
  inherited:
    Boolean(board.is_private) || !personalLayouts.personal(userId, boardScope(board.id)),
});

/** Les tableaux d'une vue que ce compte voit, dans son ordre à lui. */
const visibleBoards = (viewId: Id, userId: Id): Board[] =>
  inOrderOf(userId, viewScope(viewId), boards.visibleIn.all(viewId, userId)).map((b) =>
    boardForAccount(b, userId),
  );

const boardProjects = selection<{ id: Id; name: string }>(
  "SELECT id, name FROM projects WHERE board_id = ?",
);
const deleteBoardProjects = mutation("DELETE FROM projects WHERE board_id = ?");
const deleteBoardCategories = mutation("DELETE FROM categories WHERE board_id = ?");

/**
 * Suppression en cascade : les projets du tableau partent d'abord (leurs
 * commentaires et leurs acteurs suivent par clé étrangère), puis ses
 * catégories — un projet référence sa catégorie —, puis le tableau, qui
 * emporte ses listes, ses étiquettes, ses sections et ses widgets.
 */
const deleteCascade = transaction((id: Id): void => {
  deleteBoardProjects.run(id);
  deleteBoardCategories.run(id);
  boards.remove.run(id);
  personalLayouts.forgetScope.run(boardScope(id));
});

/**
 * Un tableau supprimé, et l'annonce de ce qu'il emporte : à ceux qui
 * suivaient ses listes ou ses cartes, et aux acteurs de chacun de ses
 * projets. Les destinataires se lisent avant la suppression.
 */
export const deleteBoard = (board: BoardRow, req: Request): void => {
  const recipients = concerned.board(board.id);
  const projects = boardProjects
    .all(board.id)
    .map((p) => ({ ...p, recipients: concerned.project(p.id) }));
  deleteCascade(board.id);
  notifyDeletion({
    kind: "card",
    targetId: board.id,
    title: board.name,
    message: "a supprimé le tableau",
    author: req.user,
    recipients,
    vanished: true,
  });
  for (const project of projects) {
    notifyDeletion({
      kind: "project",
      targetId: project.id,
      title: project.name,
      message: `a supprimé le tableau « ${board.name} » et ses projets`,
      author: req.user,
      recipients: project.recipients,
      vanished: true,
    });
  }
};

/**
 * Un tableau neuf dans une vue, à la suite des autres, sans contexte : on en
 * ajoute depuis sa liste. Sans premier widget, il naît sans section : son
 * écran vide propose d'en créer une.
 */
export const createBoard = transaction(
  (viewId: Id, name: string, firstWidget: string | null): Id => {
    const { next } = boards.nextPosition(viewId);
    const id = Number(boards.create.run(viewId, name, next, 1, 0, null, now()).lastInsertRowid);
    if (firstWidget) boardSections.setFirst(id, firstWidget);
    return id;
  },
);

export const boardRoutes = Router();

// Supprimer un tableau emporte ses listes, ses cartes, ses étiquettes, ses
// projets, ses catégories et ses widgets.
boardRoutes.use(followLists);
boardRoutes.use(
  touch("boards", "board-widgets", "task-lists", "labels", "projects", "categories", "project-labels"),
);

boardRoutes.get("/", (req, res) => {
  const { view } = req.query;
  if (!view) badRequest("La vue est requise");
  const openedView = openView(view, req.user);
  res.json(visibleBoards(openedView.id, req.user.id));
});

boardRoutes.post("/", (req, res) => {
  requireOrganize(req);
  const openedView = openView(req.body.view_id, req.user);
  const name = requireText(req.body.name, "Le nom du tableau est requis");
  const id = createBoard(openedView.id, name, null);
  res.status(201).json(boardForAccount(boards.byId.get(id)!, req.user.id));
});

// Ranger les onglets. Déclaré avant « /:id », sinon « reorder » serait pris
// pour un identifiant. L'ordre est celui de ce compte seulement
// (repositories/tab-orders.ts) : le voir suffit pour le ranger.
boardRoutes.put("/reorder", (req, res) => {
  const openedView = openView(req.body.view_id, req.user);
  const order = receivedOrder(
    req.body.ids,
    boards.visibleIn.all(openedView.id, req.user.id),
    "La liste des identifiants ne correspond pas aux tableaux de cette vue",
  );
  userTabOrders.store(req.user.id, viewScope(openedView.id), order);
  res.json(visibleBoards(openedView.id, req.user.id));
});

// Un tableau seul : sa vue surtout, où l'application doit se placer pour
// ouvrir ce qu'il contient — un projet, une carte, un widget trouvé par la
// recherche.
boardRoutes.get("/:id", (req, res) => {
  res.json(boardForAccount(openBoard(req.params.id, req.user), req.user.id));
});

boardRoutes.put("/:id", (req, res) => {
  requireOrganize(req);
  const existing = openBoard(req.params.id, req.user);
  const name = requireText(req.body.name ?? existing.name, "Le nom du tableau est requis");
  const isPrivate = flag(req.body.is_private, existing.is_private);
  // Un tableau n'a de propriétaire que privé : le fermer, c'est se le
  // réserver ; le rouvrir le rend à tous, sans propriétaire. Seul celui qui
  // l'a fermé le voit encore, et peut donc le rouvrir.
  const owner = isPrivate ? (existing.is_private ? existing.owner_id : req.user.id) : null;
  const all = requireText(
    req.body.all_contexts_label ?? existing.all_contexts_label,
    "Le libellé de « Tous les contextes » est requis",
  );
  boards.update.run(
    name,
    all,
    flag(req.body.show_card_numbers, existing.show_card_numbers),
    isPrivate,
    owner,
    existing.id,
  );
  res.json(boardForAccount(boards.byId.get(existing.id)!, req.user.id));
});

boardRoutes.delete("/:id", (req, res) => {
  requireOrganize(req);
  deleteBoard(openBoard(req.params.id, req.user), req);
  res.status(204).end();
});

// « Hérité » d'un tableau : sa structure publique, ou sa propre copie. Le
// décocher part d'une copie de la publique — sections et widgets — ; le
// recocher efface la sienne. Le voir suffit : on ne règle que pour soi. Un
// tableau privé n'a que sa structure publique.
boardRoutes.get("/:id/layout", (req, res) => {
  const board = openBoard(req.params.id, req.user);
  res.json({ inherited: boardForAccount(board, req.user.id).inherited } as LayoutState);
});

boardRoutes.put("/:id/layout", (req, res) => {
  const board = openBoard(req.params.id, req.user);
  if (board.is_private) badRequest("Un tableau privé n'a pas de structure partagée");
  const scope = boardScope(board.id);
  if (req.body.inherited) {
    boardSections.inherit(board.id, req.user.id);
    personalLayouts.remove(req.user.id, scope);
  } else if (!personalLayouts.personal(req.user.id, scope)) {
    boardSections.customize(board.id, req.user.id);
    personalLayouts.insertRow(req.user.id, scope);
  }
  res.json({ inherited: boardForAccount(board, req.user.id).inherited } as LayoutState);
});
