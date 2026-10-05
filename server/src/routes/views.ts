// Views: what the bottom selector offers. A view is born without a board,
// and belongs to its creator: they rename it, share its boards ("Partager")
// and delete it along with everything its boards contain.

import { Router } from "express";
import { isShareLevel } from "@milo/shared";
import type {
  EntraPrincipal,
  Id,
  OpeningView,
  ShareLevel,
  View,
  ViewSharePermissions,
  ViewShares,
} from "@milo/shared";
import type { UserRow, ViewRow } from "../db/rows.js";
import { requireInterface, requireOrganize, requireStructureRight } from "../lib/rights.js";
import { structureRights } from "../repositories/users.js";
import { HttpError, badRequest, requireText } from "../lib/http.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { boards } from "../repositories/boards.js";
import { receivedOrder } from "../repositories/reorder.js";
import { hiddenTabs, inOrderOf, userTabOrders, withHidden } from "../repositories/tab-orders.js";
import { views, openView } from "../repositories/views.js";
import { boardShares, ownsView } from "../repositories/shares.js";
import { deleteBoard, visibleBoards } from "./boards.js";

const VIEW_SCOPES = "views";

/** The views of its workspace that this account sees. */
const accountViews = (user: UserRow) => views.visibleTo.all(user.workspace_id, user.id);

/** A view as this account sees it: whether it is theirs, whether it hid it. */
const viewForAccount = (view: ViewRow, user: UserRow): View => {
  const { is_private: _unused, ...rest } = view;
  return {
    ...rest,
    is_owner: ownsView(view, user),
    is_hidden: hiddenTabs.of(user.id, VIEW_SCOPES).has(String(view.id)),
  };
};

/**
 * The views this account sees, in its own order — those it hid at the end:
 * none without "Lire" on views.
 */
const visibleViews = (user: UserRow): View[] =>
  structureRights(user).views.view
    ? withHidden(user.id, VIEW_SCOPES, inOrderOf(user.id, VIEW_SCOPES, accountViews(user))).map(
        (v) => viewForAccount(v, user),
      )
    : [];

/**
 * The views and boards this account would see in one of its workspaces —
 * those it hid left out —, for the profile's opening view and board.
 */
export const openingViews = (user: UserRow, workspace: Id): OpeningView[] => {
  const inWorkspace = { ...user, workspace_id: workspace };
  return visibleViews(inWorkspace)
    .filter((v) => !v.is_hidden)
    .map((v) => ({
      id: v.id,
      name: v.name,
      boards: visibleBoards(v.id, inWorkspace)
        .filter((b) => !b.is_hidden)
        .map((b) => ({ id: b.id, name: b.name })),
    }));
};

/**
 * A new view, after the others in its workspace: its creator's. It is born
 * without a board: its empty screen offers to create one.
 */
export const createView = (workspace: Id, name: string, owner: Id): Id => {
  const { next } = views.nextPosition(workspace);
  return Number(views.create.run(workspace, name, next, owner, now()).lastInsertRowid);
};

/** The requested view, which this account must own. */
const ownedView = (id: unknown, user: UserRow): ViewRow => {
  const view = openView(id, user);
  if (!ownsView(view, user)) {
    throw new HttpError(403, "Seul le propriétaire de cette vue peut la modifier");
  }
  return view;
};

export const viewRoutes = Router();

// Deleting a view takes its boards with it, and everything they contain.
viewRoutes.use(
  touch("views", "boards", "board-widgets", "task-lists", "labels", "projects", "categories"),
);

viewRoutes.get("/", (req, res) => {
  res.json(visibleViews(req.user));
});

viewRoutes.post("/", (req, res) => {
  requireStructureRight(req, "views", "create");
  const name = requireText(req.body.name, "Le nom de la vue est requis");
  if (req.user.workspace_id === null) throw new HttpError(403, "Aucun workspace");
  const view = createView(req.user.workspace_id, name, req.user.id);
  res.status(201).json(viewForAccount(views.byId.get(view)!, req.user));
});

// Reorder the views. Declared before "/:id", otherwise "reorder" would be taken for
// an id. The order is this account's only; it follows the right to modify the
// interface.
viewRoutes.put("/reorder", (req, res) => {
  requireInterface(req);
  const order = receivedOrder(
    req.body.ids,
    accountViews(req.user),
    "La liste des identifiants ne correspond pas aux vues",
  );
  userTabOrders.store(req.user.id, VIEW_SCOPES, order);
  res.json(visibleViews(req.user));
});

// "Masquer": hidden for this account, it only shows in interface editing,
// greyed at the end of the row. The last view shown stays.
viewRoutes.put("/:id/hidden", (req, res) => {
  requireInterface(req);
  const view = openView(req.params.id, req.user);
  const hidden = req.body.hidden === true;
  if (hidden && !visibleViews(req.user).some((v) => v.id !== view.id && !v.is_hidden)) {
    badRequest("La dernière vue affichée ne peut pas être masquée");
  }
  hiddenTabs.set(req.user.id, VIEW_SCOPES, view.id, hidden);
  res.json(visibleViews(req.user));
});

viewRoutes.put("/:id", (req, res) => {
  requireOrganize(req);
  const existing = ownedView(req.params.id, req.user);
  views.rename.run(requireText(req.body.name ?? existing.name, "Le nom de la vue est requis"), existing.id);
  res.json(viewForAccount(views.byId.get(existing.id)!, req.user));
});

viewRoutes.delete("/:id", (req, res) => {
  requireStructureRight(req, "views", "delete");
  const existing = ownedView(req.params.id, req.user);
  // Each board goes with what it carries and announces it — those shared
  // with others too —; then the view.
  for (const board of boards.ofView.all(existing.id)) deleteBoard(board, req);
  views.remove.run(existing.id);
  res.status(204).end();
});

/** A view's sharing: its boards, whom they can go to, and to whom they went. */
const sharesOf = (view: ViewRow): ViewShares => ({
  boards: boards.ofView.all(view.id).map(({ id, name }) => ({ id, name })),
  principals: view.workspace_id === null ? [] : boardShares.principals(view.workspace_id),
  shares: boardShares.ofView(view.id),
});

viewRoutes.get("/:id/shares", (req, res) => {
  res.json(sharesOf(ownedView(req.params.id, req.user)));
});

/**
 * A received user or group, among those with access to the workspace: its
 * name and address are those the access keeps.
 */
const receivedPrincipal = (value: unknown, principals: EntraPrincipal[]): EntraPrincipal => {
  const p = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const known = principals.find((c) => c.type === p.type && c.id === p.id);
  if (!known) badRequest("Utilisateur ou groupe sans accès à ce workspace");
  return known!;
};

/**
 * "Partager": the view's sharing, replaced as a whole — each user or group
 * with access to the workspace, with its boards, among the view's, and their
 * level. One left with no board no longer receives any.
 */
viewRoutes.put("/:id/shares", (req, res) => {
  const view = ownedView(req.params.id, req.user);
  const ownBoards = new Set(boards.ofView.all(view.id).map((b) => b.id));
  const { principals } = sharesOf(view);
  const received: unknown = req.body.shares;
  if (!Array.isArray(received)) badRequest("Les partages sont requis");
  const seen = new Set<string>();
  const shares = (received as Record<string, unknown>[]).map((r) => {
    const principal = receivedPrincipal(r?.principal, principals);
    const key = `${principal.type}:${principal.id}`;
    if (seen.has(key)) badRequest("Utilisateur ou groupe en double");
    seen.add(key);
    const given = (r?.permissions && typeof r.permissions === "object" ? r.permissions : {}) as Record<
      string,
      unknown
    >;
    const permissions: ViewSharePermissions = {};
    for (const [boardId, level] of Object.entries(given)) {
      if (!ownBoards.has(Number(boardId))) badRequest("Tableau introuvable dans cette vue");
      if (!isShareLevel(level)) badRequest("Niveau de partage inconnu");
      permissions[String(Number(boardId))] = level as ShareLevel;
    }
    return { principal, permissions };
  });
  boardShares.replaceOfView(view.id, shares);
  res.json(sharesOf(view));
});
