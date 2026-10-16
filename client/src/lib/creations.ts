// What a ticket or a project creates elsewhere — a task, a project, a ticket —
// from its right-click menu and its drawer's "Actions" menu: only what its
// widget names in its "Widgets associés" (TASK_CREATION, PROJECT_CREATION,
// SUPPORT_CREATION). The page (App.tsx) gives each its gestures.

import { createContext } from "react";
import { listKey } from "@milo/shared";
import type { BoardWidget, Project, SupportRequest } from "@milo/shared";

/** The gestures an item offers; one it does not offer is absent. */
export interface RequestCreations {
  task?: () => void;
  project?: () => void;
}

export interface ProjectCreations {
  task?: () => void;
  request?: () => void;
}

export interface Creations {
  ofRequest: (request: SupportRequest) => RequestCreations;
  ofProject: (project: Project) => ProjectCreations;
}

export const CreationsContext = createContext<Creations>({
  ofRequest: () => ({}),
  ofProject: () => ({}),
});

/**
 * The open board's widget of this type that shows an item of this list key:
 * the one of that key — the first, for an item of none (lib/lists.ts, inList).
 */
export const listWidgetOf = (widgets: BoardWidget[], type: string, key: string): BoardWidget | undefined => {
  const ofType = widgets.filter((w) => w.type === type);
  return key ? ofType.find((w) => listKey(w.config) === key) : ofType[0];
};
