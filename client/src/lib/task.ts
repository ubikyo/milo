// « Créer une tâche » : ce que chaque mode donne à la fenêtre qui la crée
// (components/board/CardDrawer.tsx, components/board/TaskDestination.tsx) — le nom de l'élément, et de quoi y
// revenir.

import { projectReference, supportTicketRef } from "@milo/shared";
import type { AccessBlockType, Asset, BoardWidget, Id, Project, SupportRequest } from "@milo/shared";
import type { SourceTask } from "../components/board/TaskDestination";
import { widgetFor } from "../widgets";

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export const projectSource = (project: Project, boardName?: string): SourceTask => ({
  kind: "project",
  id: project.id,
  title: [project.number > 0 ? projectReference(project.number) : "", project.name]
    .filter(Boolean)
    .join(" — "),
  boardName,
});

export const requestSource = (request: SupportRequest): SourceTask => ({
  kind: "support",
  id: request.id,
  title: [request.number > 0 ? supportTicketRef(request.number) : "", request.subject]
    .filter(Boolean)
    .join(" — "),
});

export const workstationSource = (workstation: Asset): SourceTask => ({
  kind: "asset",
  id: workstation.id,
  title: workstation.name,
});

/**
 * Un widget commun : son titre, son libellé ou sa première ligne, à défaut
 * le nom de son widget. Le lien ramène à son tableau ; un lien garde en plus
 * son adresse.
 */
export const accessSource = (block: BoardWidget, boardId: Id, boardName?: string): SourceTask => {
  const config = block.config ?? {};
  const rows = Array.isArray(config.lines) ? (config.lines as Record<string, unknown>[]) : [];
  const title =
    text(config.title) ||
    text(config.label) ||
    text(rows[0]?.label) ||
    text(config.url) ||
    widgetFor(block.type as AccessBlockType)?.label ||
    "Accès";
  const url = block.type === "link" ? text(config.url) : "";
  return { kind: "access", id: boardId, title, url: url || undefined, boardName };
};
