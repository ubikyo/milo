// Views: what the bottom selector offers. A view is born without a board,
// and belongs to its creator: they rename it, share its boards ("Partager")
// and delete it along with everything its boards contain.

import { Router } from "express";
import type { Request } from "express";
import { SUBVIEW_KINDS, isShareLevel } from "@milo/shared";
import type {
  EntraPrincipal,
  Id,
  OpeningView,
  ShareLevel,
  SubviewGroup,
  SubviewKind,
  SubviewsSaved,
  View,
  ViewSharePermissions,
  ViewShares,
} from "@milo/shared";
import type { UserRow, ViewRow } from "../db/rows.js";
import { requireInterface, requireOrganize, requireStructureRight } from "../lib/rights.js";
import { HttpError, badRequest, requireText } from "../lib/http.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { boards } from "../repositories/boards.js";
import { subviewGroups, subviews } from "../repositories/subviews.js";
import { mutation, transaction } from "../db/query.js";
import { receivedOrder } from "../repositories/reorder.js";
import { hiddenTabs, inOrderOf, userTabOrders, withHidden } from "../repositories/tab-orders.js";
import { views, openView } from "../repositories/views.js";
import { boardShares, ownsView } from "../repositories/shares.js";
import { workspaces } from "../repositories/workspaces.js";
import { inviteToShare } from "../lib/invitations.js";
import { sharePrincipals } from "../lib/workspace-people.js";
import { root } from "../lib/notify.js";
import { createBoard, deleteBoard, visibleBoards } from "./boards.js";
import { byId, deleteWithUndo } from "../lib/undo.js";

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
    parent_disabled: Boolean(view.parent_disabled),
    subviews: subviewsOf(view, user),
  };
};

/**
 * The views this account sees, in its own order — those it hid at the end.
 */
const visibleViews = (user: UserRow): View[] =>
  withHidden(user.id, VIEW_SCOPES, inOrderOf(user.id, VIEW_SCOPES, accountViews(user))).map(
    (v) => viewForAccount(v, user),
  );

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
  if (typeof req.body.parent_disabled === "boolean") {
    views.setParentDisabled.run(Number(req.body.parent_disabled), existing.id);
  }
  res.json(viewForAccount(views.byId.get(existing.id)!, req.user));
});

viewRoutes.delete("/:id", (req, res) => {
  requireStructureRight(req, "views", "delete");
  const existing = ownedView(req.params.id, req.user);
  // Each board goes with what it carries and announces it — those shared
  // with others too —; then the view. The token undoes it (lib/undo.ts).
  const undo = deleteWithUndo(req.user.id, [byId("views", existing.id)], () => {
    for (const board of boards.ofView.all(existing.id)) deleteBoard(board, req);
    views.remove.run(existing.id);
  });
  res.json({ undo });
});

/** A view's sharing: its boards, whom they can go to, and to whom they went. */
const sharesOf = async (view: ViewRow): Promise<ViewShares> => ({
  boards: boards.ofView.all(view.id).map(({ id, name }) => ({ id, name })),
  principals: view.workspace_id === null ? [] : await sharePrincipals(view.workspace_id),
  shares: boardShares.ofView(view.id),
});

viewRoutes.get("/:id/shares", (req, res, next) => {
  sharesOf(ownedView(req.params.id, req.user))
    .then((shares) => res.json(shares))
    .catch(next);
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
 * level. One left with no board no longer receives any. Those just added,
 * when "invite" is given, receive the "Nouveau partage" e-mail — each user of
 * a group.
 */
viewRoutes.put("/:id/shares", (req, res, next) => {
  const view = ownedView(req.params.id, req.user);
  sharesOf(view)
    .then(({ principals }) => replaceShares(req, view, principals))
    .then((shares) => res.json(shares))
    .catch(next);
});

/** The sharing received, saved; then re-read. */
const replaceShares = (req: Request, view: ViewRow, principals: EntraPrincipal[]): Promise<ViewShares> => {
  const ownBoards = new Set(boards.ofView.all(view.id).map((b) => b.id));
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
  const before = new Set(
    boardShares.ofView(view.id).map((s) => `${s.principal.type}:${s.principal.id}`),
  );
  boardShares.replaceOfView(view.id, shares);
  if (req.body.invite === true) {
    const added = shares.filter(
      (s) =>
        Object.keys(s.permissions).length > 0 &&
        !before.has(`${s.principal.type}:${s.principal.id}`),
    );
    const names = new Map(boards.ofView.all(view.id).map((b) => [String(b.id), b.name]));
    const workspace = view.workspace_id === null ? undefined : workspaces.byId.get(view.workspace_id);
    inviteToShare(
      added.map((s) => s.principal),
      (principal) =>
        Object.keys(
          added.find((s) => s.principal.type === principal.type && s.principal.id === principal.id)
            ?.permissions ?? {},
        ).map((id) => names.get(id) ?? ""),
      { name: view.name, workspace: workspace?.name ?? "" },
      req.user,
      root(req),
    );
  }
  return sharesOf(view);
};

/**
 * A view's sub-views: those without a group first — as a group with no id
 * nor name —, then each group's. A "page" sub-view none of whose boards this
 * account sees is left out, it would open nothing — except for the view's
 * owner, who adds its boards.
 */
const subviewsOf = (view: ViewRow, user: UserRow): SubviewGroup[] => {
  const owner = ownsView(view, user);
  const all = subviews.ofView
    .all(view.id)
    .filter(
      (s) => s.kind !== "page" || owner || boards.visibleInSubview.all(s.id, user.id).length > 0,
    );
  const of = (group: Id | null) =>
    all
      .filter((s) => s.group_id === group)
      .map((s) => ({ id: s.id, name: s.name, kind: s.kind as SubviewKind }));
  return [
    { id: null, name: "", subviews: of(null) },
    ...subviewGroups.ofView.all(view.id).map((g) => ({ id: g.id, name: g.name, subviews: of(g.id) })),
  ];
};

viewRoutes.get("/:id/subviews", (req, res) => {
  res.json(subviewsOf(openView(req.params.id, req.user), req.user));
});

const renameBoard = mutation("UPDATE boards SET name = ? WHERE id = ?");

/** A received row: its key, its id if it has one, and its name. */
const received = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** A received list of sub-views. */
const receivedList = (value: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(value)) badRequest("Les sous-vues sont requises");
  return (value as unknown[]).map(received);
};

/**
 * The sub-views, replaced as a whole: what is not listed goes — a "page"
 * one with its boards, and everything they carry. A "page" sub-view is born
 * with a first board, named after it; renamed, its single board, if it still
 * bears its name, follows. A row just added and left without a name is not
 * created; an existing one keeps its name.
 */
const replaceSubviews = transaction((req: Request, view: ViewRow): Record<string, Id> => {
  const groupsIn: unknown = req.body.groups;
  if (!Array.isArray(groupsIn)) badRequest("Les groupes sont requis");
  const beforeGroups = new Map(subviewGroups.ofView.all(view.id).map((g) => [g.id, g]));
  const beforeSubviews = new Map(subviews.ofView.all(view.id).map((s) => [s.id, s]));

  const ungrouped = receivedList(req.body.subviews);
  const groups = (groupsIn as unknown[])
    .map(received)
    .map((g) => ({ key: g.key, id: g.id, name: g.name, items: receivedList(g.subviews) }));
  const keptGroups = new Set<Id>();
  const keptSubviews = new Set<Id>();
  for (const s of [...ungrouped, ...groups.flatMap((g) => g.items)]) {
    if (s.id !== undefined) {
      if (!beforeSubviews.has(Number(s.id))) badRequest("Sous-vue introuvable dans cette vue");
      keptSubviews.add(Number(s.id));
    }
    if (!SUBVIEW_KINDS.includes(s.kind as SubviewKind)) badRequest("Type de sous-vue inconnu");
  }
  for (const g of groups) {
    if (g.id === undefined) continue;
    if (!beforeGroups.has(Number(g.id))) badRequest("Groupe introuvable dans cette vue");
    keptGroups.add(Number(g.id));
  }

  // What goes first: the sub-views, with their boards, then the groups.
  for (const s of beforeSubviews.values()) {
    if (keptSubviews.has(s.id)) continue;
    for (const board of boards.ofSubview.all(s.id)) deleteBoard(board, req);
    subviews.remove.run(s.id);
  }
  for (const g of beforeGroups.values()) {
    if (!keptGroups.has(g.id)) subviewGroups.remove.run(g.id);
  }

  const ids: Record<string, Id> = {};
  /** A group's sub-views — or those without one —, in their order. */
  const place = (items: Record<string, unknown>[], groupId: Id | null) => {
    let position = 0;
    for (const s of items) {
      const existing = s.id === undefined ? undefined : beforeSubviews.get(Number(s.id));
      const name = text(s.name) || existing?.name || "";
      if (!name) continue;
      // What it opens is chosen once, on its creation.
      const kind = (existing?.kind ?? s.kind) as SubviewKind;
      if (existing) {
        const own = boards.ofSubview.all(existing.id);
        if (own.length === 1 && own[0]!.name === existing.name && name !== existing.name) {
          renameBoard.run(name, own[0]!.id);
        }
        subviews.update.run(groupId, name, kind, position, existing.id);
      } else {
        const id = Number(subviews.create.run(view.id, groupId, name, kind, position).lastInsertRowid);
        if (kind === "page") createBoard(view.id, id, name, req.user.id, null);
        ids[String(s.key)] = id;
      }
      position += 1;
    }
  };

  place(ungrouped, null);
  let groupPosition = 0;
  for (const g of groups) {
    const before = g.id === undefined ? undefined : beforeGroups.get(Number(g.id));
    const name = text(g.name) || before?.name || "";
    let groupId = before?.id;
    if (groupId === undefined) {
      // A group just added, without a name nor sub-views, is not created.
      if (!name && !g.items.some((s) => text(s.name))) continue;
      groupId = Number(subviewGroups.create.run(view.id, name, groupPosition).lastInsertRowid);
      ids[String(g.key)] = groupId;
    } else {
      subviewGroups.update.run(name, groupPosition, groupId);
    }
    groupPosition += 1;
    place(g.items, groupId);
  }
  return ids;
});

// Its owner arranges a view's sub-views, as they rename it.
viewRoutes.put("/:id/subviews", (req, res) => {
  requireOrganize(req);
  const view = ownedView(req.params.id, req.user);
  const ids = replaceSubviews(req, view);
  const saved: SubviewsSaved = { groups: subviewsOf(view, req.user), ids };
  res.json(saved);
});
