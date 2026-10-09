// Workspaces, as managed by whoever has the right (requireWorkspaces):
// reading them ("Voir"), adding and renaming them ("Créer"), deleting them
// ("Supprimer"). Their access is set elsewhere,
// workspace by workspace (routes/assignments.ts).
//
// A workspace is born empty: its first view is created from the empty screen
// that greets it ("Aucune vue"). It leaves with everything its views carry.
// Even the last one can go: whoever has none lands on an empty screen that
// leads to the Settings.

import { Router } from "express";
import type { Workspace } from "@milo/shared";
import { HttpError, requireText } from "../lib/http.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { boards, viewBoards } from "../repositories/boards.js";
import { WORKSPACE_NOT_FOUND, workspaceViews, workspaces } from "../repositories/workspaces.js";
import { deleteBoard } from "./boards.js";

const NAME_REQUIRED = "Le nom du workspace est requis";

/** The requested workspace, or "introuvable". */
const openWorkspace = (id: unknown): Workspace => {
  const workspace = workspaces.byId.get(id);
  if (!workspace) throw new HttpError(404, WORKSPACE_NOT_FOUND);
  return workspace;
};

/** A new workspace, after the others, without a view. */
const createWorkspace = (name: string): Workspace => {
  const { next } = workspaces.nextPosition();
  const id = Number(workspaces.create.run(name, next, now()).lastInsertRowid);
  return workspaces.byId.get(id)!;
};

export const workspaceRoutes = Router();

// Deleting a workspace takes its views with it, and everything they carry; its
// access changes what each person sees.
workspaceRoutes.use(
  touch(
    "lookups",
    "views",
    "boards",
    "board-widgets",
    "task-lists",
    "labels",
    "projects",
    "categories",
  ),
);

workspaceRoutes.get("/", (_req, res) => {
  res.json(workspaces.all.all());
});

workspaceRoutes.post("/", (req, res) => {
  res.status(201).json(createWorkspace(requireText(req.body.name, NAME_REQUIRED)));
});

workspaceRoutes.put("/:id", (req, res) => {
  const existing = openWorkspace(req.params.id);
  workspaces.rename.run(requireText(req.body.name ?? existing.name, NAME_REQUIRED), existing.id);
  res.json(workspaces.byId.get(existing.id));
});

workspaceRoutes.delete("/:id", (req, res) => {
  const existing = openWorkspace(req.params.id);
  // Each board goes with what it carries and announces it, whoever owns it;
  // the views and access follow the workspace.
  for (const { id: view } of workspaceViews.all(existing.id)) {
    for (const { id } of viewBoards.all(view)) {
      const board = boards.byId.get(id);
      if (board) deleteBoard(board, req);
    }
  }
  workspaces.remove.run(existing.id);
  res.status(204).end();
});
