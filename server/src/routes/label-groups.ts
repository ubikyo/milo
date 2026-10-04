// The routes of label groups, mounted on each labels router — cards',
// projects', Support's: "/groups" to read, create, rename and delete them,
// "/arrange" to order groups and labels together. Only the store and the way
// to check access change from one kind to the other.

import type { Request, Router } from "express";
import type { Id, Right } from "@milo/shared";
import { conflict, orNotFound, requireText } from "../lib/http.js";
import type { LabelGroupStore } from "../repositories/label-groups.js";
import { renameContextGroup } from "../repositories/contexts.js";

const GROUP_NOT_FOUND = "Groupe introuvable";

/**
 * The scope of a request, once its access is checked for this right: the
 * board's id, or nothing for Support. Throws when access is refused.
 */
export type ScopeOf = (req: Request, boardId: unknown, right: Right) => Id | undefined;

/** Declared before "/:id": "/arrange" would otherwise be taken for an id. */
export const mountLabelGroups = (
  routes: Router,
  groups: LabelGroupStore,
  scopeOf: ScopeOf,
): void => {
  routes.get("/groups", (req, res) => {
    res.json(groups.ofScope(scopeOf(req, req.query.board, "view")));
  });

  routes.post("/groups", (req, res) => {
    const scope = scopeOf(req, req.body.board_id, "create");
    const name = requireText(req.body.name, "Le nom du groupe est requis");
    res.status(201).json(groups.byId(groups.create(scope, name)));
  });

  routes.put("/groups/:id", (req, res) => {
    const existing = orNotFound(groups.byId(req.params.id), GROUP_NOT_FOUND);
    scopeOf(req, existing.board_id, "update");
    const name = requireText(req.body.name, "Le nom du groupe est requis");
    groups.rename(existing.id, name);
    // A board's context group is named: it follows the rename.
    renameContextGroup(existing.board_id, existing.name, name);
    res.json(groups.byId(existing.id));
  });

  // A group goes once emptied: its labels are moved or deleted first.
  routes.delete("/groups/:id", (req, res) => {
    const existing = orNotFound(groups.byId(req.params.id), GROUP_NOT_FOUND);
    scopeOf(req, existing.board_id, "delete");
    const count = groups.labelCount(existing.id);
    if (count > 0) {
      conflict(
        `Impossible de supprimer « ${existing.name} » : le groupe contient encore ${count} étiquette${
          count > 1 ? "s" : ""
        }.`,
      );
    }
    groups.remove(existing.id);
    res.status(204).end();
  });

  // The whole arrangement: every group, in order, each with its labels.
  routes.put("/arrange", (req, res) => {
    const scope = scopeOf(req, req.body.board_id, "update");
    groups.arrange(scope, groups.receivedLayout(req.body.groups, scope));
    res.status(204).end();
  });
};
