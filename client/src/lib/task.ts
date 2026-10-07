// "Créer une tâche": what each mode gives to the window that creates it
// (components/board/CardDrawer.tsx, components/board/TaskDestination.tsx) — the
// item's name, and how to get back to it.

import { linkEntries, projectReference, supportTicketRef } from "@milo/shared";
import type { AccessBlockType, Asset, BoardWidget, Id, Project, SupportRequest } from "@milo/shared";
import type { SourceTask } from "../components/board/TaskDestination";
import { widgetFor } from "../widgets/common";

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
 * A common widget: its title, its label or its first line, failing that
 * the name of its widget. The link leads back to its board; a link also keeps
 * its address.
 */
export const accessSource = (block: BoardWidget, boardId: Id, boardName?: string): SourceTask => {
  const config = block.config ?? {};
  // A link widget is read through its first link.
  const link = block.type === "link" ? linkEntries(config)[0] : undefined;
  const rows = Array.isArray(config.lines) ? (config.lines as Record<string, unknown>[]) : [];
  const title =
    text(config.title) ||
    text(link?.label ?? config.label) ||
    text(rows[0]?.label) ||
    text(link?.url ?? config.url) ||
    widgetFor(block.type as AccessBlockType)?.label ||
    "Accès";
  const url = text(link?.url);
  return { kind: "access", id: boardId, title, url: url || undefined, boardName };
};
