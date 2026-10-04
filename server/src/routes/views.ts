// Les vues : ce que le sélecteur du bas propose. Une vue naît avec un tableau,
// sans filtre de société ; elle se renomme, se ferme aux autres (« Privé ») et
// se supprime avec tout ce que ses tableaux contiennent.

import { Router } from "express";
import type { Request } from "express";
import type { Id, View } from "@milo/shared";
import { transaction } from "../db/query.js";
import { requireOrganize } from "../lib/rights.js";
import { HttpError, requireText } from "../lib/http.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { boards } from "../repositories/boards.js";
import { receivedOrder } from "../repositories/reorder.js";
import { inOrderOf, userTabOrders } from "../repositories/tab-orders.js";
import { views, openView } from "../repositories/views.js";
import { createBoard, deleteBoard, boardForAccount } from "./boards.js";

/** Un réglage arrive en booléen ; la base le range en 0 ou 1. */
const flag = (value: unknown, defaultValue: 0 | 1): 0 | 1 =>
  value === undefined ? defaultValue : (Number(Boolean(value)) as 0 | 1);

const VIEW_SCOPES = "views";

/** Les vues de son workspace que ce compte voit. */
const accountViews = (req: Request) => views.visibleTo.all(req.user.workspace_id, req.user.id);

/** Les vues que ce compte voit, dans son ordre à lui. */
const visibleViews = (req: Request): View[] =>
  inOrderOf(req.user.id, VIEW_SCOPES, accountViews(req));

/** Une vue neuve, à la suite des autres de son workspace, avec son premier tableau. */
export const createView = transaction((workspace: Id, name: string): { view: Id; board: Id } => {
  const { next } = views.nextPosition(workspace);
  const view = Number(views.create.run(workspace, name, next, 0, null, now()).lastInsertRowid);
  return { view, board: createBoard(view, "Tableau", null) };
});

export const viewRoutes = Router();

// Supprimer une vue emporte ses tableaux, et tout ce qu'ils contiennent.
viewRoutes.use(
  touch("views", "boards", "board-widgets", "task-lists", "labels", "projects", "categories"),
);

viewRoutes.get("/", (req, res) => {
  res.json(visibleViews(req));
});

viewRoutes.post("/", (req, res) => {
  requireOrganize(req);
  const name = requireText(req.body.name, "Le nom de la vue est requis");
  if (req.user.workspace_id === null) throw new HttpError(403, "Aucun workspace");
  const { view, board } = createView(req.user.workspace_id, name);
  res.status(201).json({
    view: views.byId.get(view),
    board: boardForAccount(boards.byId.get(board)!, req.user.id),
  });
});

// Ranger les vues. Déclaré avant « /:id », sinon « reorder » serait pris pour
// un identifiant. L'ordre est celui de ce compte seulement : le voir suffit.
viewRoutes.put("/reorder", (req, res) => {
  const order = receivedOrder(
    req.body.ids,
    accountViews(req),
    "La liste des identifiants ne correspond pas aux vues",
  );
  userTabOrders.store(req.user.id, VIEW_SCOPES, order);
  res.json(visibleViews(req));
});

viewRoutes.put("/:id", (req, res) => {
  requireOrganize(req);
  const existing = openView(req.params.id, req.user);
  const name = requireText(req.body.name ?? existing.name, "Le nom de la vue est requis");
  const isPrivate = flag(req.body.is_private, existing.is_private);
  // Comme un tableau : la fermer, c'est se la réserver ; la rouvrir la rend à
  // tous, sans propriétaire.
  const owner = isPrivate ? (existing.is_private ? existing.owner_id : req.user.id) : null;
  views.update.run(name, isPrivate, owner, existing.id);
  res.json(views.byId.get(existing.id));
});

viewRoutes.delete("/:id", (req, res) => {
  requireOrganize(req);
  const existing = openView(req.params.id, req.user);
  // Chaque tableau part avec ce qu'il emporte et l'annonce ; la vue ensuite.
  for (const board of boards.visibleIn.all(existing.id, req.user.id)) deleteBoard(board, req);
  views.remove.run(existing.id);
  res.status(204).end();
});
