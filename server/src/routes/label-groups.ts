// The routes of label groups, mounted on each labels router — cards',
// projects', Support's: "/groups" to read, create, rename and delete them,
// "/arrange" to order groups and labels together. Only the store and the way
// to check access change from one kind to the other.

import type { Request, Router } from "express";
import type { Id, Right } from "@milo/shared";
import { conflict, orNotFound, requireText } from "../lib/http.js";
import type { LabelGroupStore } from "../repositories/label-groups.js";
import { renameContextGroup } from "../repositories/contexts.js";
import type { ListScope } from "../repositories/lists.js";

const GROUP_NOT_FOUND = "Groupe introuvable";

/**
 * The scope of a request, once its access is checked for this right: the
 * list widget that owns the groups (ListScope). Throws when access is
 * refused, or when no widget of the board holds the key.
 */
export type ScopeOf = (req: Request, boardId: unknown, list: unknown, right: Right) => ListScope;

/** The board of a request, once its access is checked for this right. */
export type BoardOf = (req: Request, boardId: unknown, right: Right) => Id;

/** Announces a change of the groups on their board (lib/notify.ts, `notifyBoard`). */
export type Announce = (req: Request, boardId: Id | null | undefined, message: string) => void;

/** Declared before "/:id": "/arrange" would otherwise be taken for an id. */
export const mountLabelGroups = (
  routes: Router,
  groups: LabelGroupStore,
  scopeOf: ScopeOf,
  boardOf: BoardOf,
  announce: Announce,
): void => {
  // Without a list, every group of the board: each carries its list key.
  routes.get("/groups", (req, res) => {
    const { board, list } = req.query;
    res.json(
      list
        ? groups.ofScope(scopeOf(req, board, list, "view"))
        : groups.ofBoard(boardOf(req, board, "view")),
    );
  });

  routes.post("/groups", (req, res) => {
    const scope = scopeOf(req, req.body.board_id, req.body.list_key, "create");
    const name = requireText(req.body.name, "Le nom du groupe est requis");
    const created = groups.create(scope, name);
    announce(req, scope.board, `a ajouté le groupe d'étiquettes « ${name} »`);
    res.status(201).json(groups.byId(created));
  });

  routes.put("/groups/:id", (req, res) => {
    const existing = orNotFound(groups.byId(req.params.id), GROUP_NOT_FOUND);
    scopeOf(req, existing.board_id, existing.list_key, "update");
    const name = requireText(req.body.name, "Le nom du groupe est requis");
    groups.rename(existing.id, name);
    // A board's context group is named: it follows the rename.
    renameContextGroup(existing.board_id, existing.name, name);
    if (name !== existing.name) {
      announce(req, existing.board_id, `a renommé le groupe d'étiquettes « ${existing.name} » en « ${name} »`);
    }
    res.json(groups.byId(existing.id));
  });

  // A group goes once emptied: its labels are moved or deleted first.
  routes.delete("/groups/:id", (req, res) => {
    const existing = orNotFound(groups.byId(req.params.id), GROUP_NOT_FOUND);
    scopeOf(req, existing.board_id, existing.list_key, "delete");
    const count = groups.labelCount(existing.id);
    if (count > 0) {
      conflict(
        `Impossible de supprimer « ${existing.name} » : le groupe contient encore ${count} étiquette${
          count > 1 ? "s" : ""
        }.`,
      );
    }
    groups.remove(existing.id);
    announce(req, existing.board_id, `a supprimé le groupe d'étiquettes « ${existing.name} »`);
    res.status(204).end();
  });

  // The whole arrangement: every group, in order, each with its labels.
  routes.put("/arrange", (req, res) => {
    const scope = scopeOf(req, req.body.board_id, req.body.list_key, "update");
    groups.arrange(scope, groups.receivedLayout(req.body.groups, scope));
    announce(req, scope.board, "a réorganisé les étiquettes");
    res.status(204).end();
  });
};
