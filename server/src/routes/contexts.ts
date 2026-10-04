// Les contextes d'un tableau : les ajouter, les renommer, les ranger, les
// supprimer — ce qui emporte leurs projets, leurs cartes, leurs demandes et
// leurs postes —, et choisir celui qu'on regarde. Chaque route rend le
// tableau tel que ce compte le voit, ses contextes à jour.
//
// Les contextes sont la structure commune du tableau : les changer demande de
// pouvoir organiser les tableaux (lib/droits.ts). Choisir celui qu'on regarde
// ne regarde que soi : voir le tableau suffit.

import { Router } from "express";
import type { Request } from "express";
import { mutation } from "../db/query.js";
import type { ContextRow } from "../db/rows.js";
import { requireOrganize } from "../lib/rights.js";
import { badRequest, notFound, requireText } from "../lib/http.js";
import { touch, touchNow } from "../middleware/events.js";
import { boards, readableBoard, openBoard } from "../repositories/boards.js";
import {
  addContext,
  boardContext,
  contexts,
  copyContexts,
} from "../repositories/contexts.js";
import { arrangeContexts, receivedOrder } from "../repositories/reorder.js";
import { followLists } from "./board-widgets.js";
import { boardForAccount } from "./boards.js";

const CONTEXT_NOT_FOUND = "Contexte introuvable";

/** Le libellé de « Tous les contextes » d'un tableau. */
const renameAll = mutation("UPDATE boards SET all_contexts_label = ? WHERE id = ?");

/** Le tableau de la route, tel que ce compte le voit. */
const render = (req: Request, boardId: number) =>
  boardForAccount(boards.byId.get(boardId)!, req.user.id);

/** Un contexte d'un tableau que ce compte voit. */
const openContext = (id: unknown, req: Request): ContextRow => {
  const context = contexts.byId.get(id);
  if (!context || !readableBoard(boards.byId.get(context.board_id), req.user)) {
    return notFound(CONTEXT_NOT_FOUND);
  }
  return context;
};

/** Monté sous /api/boards/:id/contexts. */
export const boardContextRoutes = Router({ mergeParams: true });

// Choisir le contexte qu'on regarde : nul pour tous. Déclaré avant le reste,
// qui touche la structure commune.
boardContextRoutes.put("/selected", (req, res) => {
  const board = openBoard((req.params as { id: string }).id, req.user);
  const value = req.body.context_id;
  const selected =
    value === null || value === undefined || value === "" || value === "all"
      ? null
      : boardContext(board.id, value);
  contexts.select.run(req.user.id, board.id, selected);
  res.json(render(req, board.id));
});

boardContextRoutes.use(touch("boards"));

boardContextRoutes.post("/", (req, res) => {
  requireOrganize(req);
  const board = openBoard((req.params as { id: string }).id, req.user);
  const name = requireText(req.body.name, "Le nom du contexte est requis");
  addContext(board.id, name);
  res.status(201).json(render(req, board.id));
});

// Copier les contextes du tableau vers un autre, à la suite des siens. Ceux
// qui y portent déjà le même nom ne sont pas redoublés : ils sont comptés.
// Seuls les noms passent — pas ce que les contextes contiennent. « replace » :
// ceux de l'accueil s'en vont d'abord, avec ce qu'ils contiennent.
// « rename_all » : l'accueil reprend aussi le libellé de « Tous les
// contextes », le sélecteur global.
boardContextRoutes.post("/copy", (req, res) => {
  requireOrganize(req);
  const source = openBoard((req.params as { id: string }).id, req.user);
  if (!req.body.to_board) badRequest("Le tableau de destination est requis");
  const target = openBoard(req.body.to_board, req.user);
  if (source.id === target.id) badRequest("Choisissez un autre tableau que celui-ci");
  const replaceExisting = req.body.replace === true;
  if (replaceExisting) touchNow(res, "projects", "task-lists", "support-requests", "assets");
  const result = copyContexts(source.id, target.id, replaceExisting);
  if (req.body.rename_all === true) renameAll.run(source.all_contexts_label, target.id);
  res.json(result);
});

boardContextRoutes.put("/reorder", (req, res) => {
  requireOrganize(req);
  const board = openBoard((req.params as { id: string }).id, req.user);
  const order = receivedOrder(
    req.body.ids,
    contexts.ofBoard.all(board.id),
    "La liste des identifiants ne correspond pas aux contextes de ce tableau",
  );
  arrangeContexts(order, board.id);
  res.json(render(req, board.id));
});

/** Monté sous /api/contexts. */
export const contextRoutes = Router();

contextRoutes.use(followLists);

contextRoutes.put("/:id", touch("boards"), (req, res) => {
  requireOrganize(req);
  const context = openContext(req.params.id, req);
  contexts.rename.run(requireText(req.body.name, "Le nom du contexte est requis"), context.id);
  res.json(render(req, context.board_id));
});

// Supprimer un contexte emporte, par clé étrangère, ses projets, ses cartes,
// ses demandes et ses postes — et ce qui pend à chacun.
contextRoutes.delete(
  "/:id",
  touch("boards", "projects", "task-lists", "support-requests", "assets"),
  (req, res) => {
    requireOrganize(req);
    const context = openContext(req.params.id, req);
    contexts.remove.run(context.id);
    res.json(render(req, context.board_id));
  },
);
