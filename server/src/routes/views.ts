// Views: what the bottom selector offers. A view is born with a board,
// with no company filter; it can be renamed, closed to others ("Privé") and
// deleted along with everything its boards contain.

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

/** A setting arrives as a boolean; the database stores it as 0 or 1. */
const flag = (value: unknown, defaultValue: 0 | 1): 0 | 1 =>
  value === undefined ? defaultValue : (Number(Boolean(value)) as 0 | 1);

const VIEW_SCOPES = "views";

/** The views of its workspace that this account sees. */
const accountViews = (req: Request) => views.visibleTo.all(req.user.workspace_id, req.user.id);

/** The views this account sees, in its own order. */
const visibleViews = (req: Request): View[] =>
  inOrderOf(req.user.id, VIEW_SCOPES, accountViews(req));

/** A new view, after the others in its workspace, with its first board. */
export const createView = transaction((workspace: Id, name: string): { view: Id; board: Id } => {
  const { next } = views.nextPosition(workspace);
  const view = Number(views.create.run(workspace, name, next, 0, null, now()).lastInsertRowid);
  return { view, board: createBoard(view, "Tableau", null) };
});

export const viewRoutes = Router();

// Deleting a view takes its boards with it, and everything they contain.
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

// Reorder the views. Declared before "/:id", otherwise "reorder" would be taken for
// an id. The order is this account's only: seeing the view is enough.
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
  // Like a board: closing it reserves it for oneself; reopening it gives it back to
  // everyone, without an owner.
  const owner = isPrivate ? (existing.is_private ? existing.owner_id : req.user.id) : null;
  views.update.run(name, isPrivate, owner, existing.id);
  res.json(views.byId.get(existing.id));
});

viewRoutes.delete("/:id", (req, res) => {
  requireOrganize(req);
  const existing = openView(req.params.id, req.user);
  // Each board goes with what it carries and announces it; then the view.
  for (const board of boards.visibleIn.all(existing.id, req.user.id)) deleteBoard(board, req);
  views.remove.run(existing.id);
  res.status(204).end();
});
