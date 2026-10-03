// Les workspaces, tels que les gère qui en a le droit (requireWorkspaces) :
// les ajouter, les renommer, les supprimer. Leurs accès se règlent ailleurs,
// workspace par workspace (routes/assignments.ts).
//
// Un workspace naît avec une vue et son tableau, pour que son équipe ait où
// poser ses premiers widgets ; il part avec tout ce que ses vues portent. Le
// dernier ne se supprime pas : il en faut toujours un.

import { Router } from "express";
import type { Workspace } from "@milo/shared";
import { transaction } from "../db/query.js";
import { HttpError, conflict, requireText } from "../lib/http.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { boards, tableauxDeLaVue } from "../repositories/boards.js";
import { WORKSPACE_INTROUVABLE, vuesDuWorkspace, workspaces } from "../repositories/workspaces.js";
import { supprimerTableau } from "./boards.js";
import { creerVue } from "./views.js";

const NOM_REQUIS = "Le nom du workspace est requis";

/** Le workspace demandé, ou « introuvable ». */
const workspaceOuvert = (id: unknown): Workspace => {
  const workspace = workspaces.byId.get(id);
  if (!workspace) throw new HttpError(404, WORKSPACE_INTROUVABLE);
  return workspace;
};

/** Un workspace neuf, à la suite des autres, avec sa première vue. */
const creerWorkspace = transaction((name: string): Workspace => {
  const { next } = workspaces.nextPosition();
  const id = Number(workspaces.create.run(name, next, now()).lastInsertRowid);
  creerVue(id, "Vue");
  return workspaces.byId.get(id)!;
});

export const workspaceRoutes = Router();

// Supprimer un workspace emporte ses vues, et tout ce qu'elles portent ; ses
// accès changent ce que chacun voit.
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
  res.status(201).json(creerWorkspace(requireText(req.body.name, NOM_REQUIS)));
});

workspaceRoutes.put("/:id", (req, res) => {
  const existing = workspaceOuvert(req.params.id);
  workspaces.rename.run(requireText(req.body.name ?? existing.name, NOM_REQUIS), existing.id);
  res.json(workspaces.byId.get(existing.id));
});

workspaceRoutes.delete("/:id", (req, res) => {
  const existing = workspaceOuvert(req.params.id);
  if (workspaces.all.all().length <= 1) conflict("Le dernier workspace ne se supprime pas");
  // Chaque tableau part avec ce qu'il emporte et l'annonce, privés compris ;
  // les vues et les accès suivent le workspace.
  for (const { id: vue } of vuesDuWorkspace.all(existing.id)) {
    for (const { id } of tableauxDeLaVue.all(vue)) {
      const board = boards.byId.get(id);
      if (board) supprimerTableau(board, req);
    }
  }
  workspaces.remove.run(existing.id);
  res.status(204).end();
});
