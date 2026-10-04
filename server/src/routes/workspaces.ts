// Workspaces, as managed by whoever has the right (requireWorkspaces):
// adding, renaming, deleting them. Their access is set elsewhere,
// workspace by workspace (routes/assignments.ts).
//
// A workspace is born with a view and its board, so that its team has somewhere to
// place its first widgets; it leaves with everything its views carry. The
// last one cannot be deleted: there must always be one.

import { Router } from "express";
import type { Workspace } from "@milo/shared";
import { transaction } from "../db/query.js";
import { HttpError, conflict, requireText } from "../lib/http.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { boards, viewBoards } from "../repositories/boards.js";
import { WORKSPACE_NOT_FOUND, workspaceViews, workspaces } from "../repositories/workspaces.js";
import { deleteBoard } from "./boards.js";
import { createView } from "./views.js";

const NAME_REQUIRED = "Le nom du workspace est requis";

/** The requested workspace, or "introuvable". */
const openWorkspace = (id: unknown): Workspace => {
  const workspace = workspaces.byId.get(id);
  if (!workspace) throw new HttpError(404, WORKSPACE_NOT_FOUND);
  return workspace;
};

/** A new workspace, after the others, with its first view. */
const createWorkspace = transaction((name: string): Workspace => {
  const { next } = workspaces.nextPosition();
  const id = Number(workspaces.create.run(name, next, now()).lastInsertRowid);
  createView(id, "Vue");
  return workspaces.byId.get(id)!;
});

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
  if (workspaces.all.all().length <= 1) conflict("Le dernier workspace ne se supprime pas");
  // Each board goes with what it carries and announces it, private ones included;
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
