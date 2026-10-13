// What a new list widget brings with it: its own default labels, and for a
// "Projets" widget its "Défaut" milestone type. Each list widget owns its
// settings (repositories/lists.ts, ListScope): they are seeded for its key,
// whatever the board's other widgets carry.

import { DECLARED_ASSET_RESOURCES, isDeclaredAssetKind, listKey } from "@milo/shared";
import type { Id, Resource } from "@milo/shared";
import { ensureDefaultType } from "../routes/milestone-types.js";
import { ensureDeclaredAssetLabels } from "./declared-asset-labels.js";
import { ensureProjectPriorities } from "./projects.js";
import { ensureSupportLabels } from "./support.js";

const read = (config: string): unknown => {
  try {
    return JSON.parse(config) as unknown;
  } catch {
    return {};
  }
};

/**
 * Seeds the widget just created, of this type and configuration (its key
 * already given), in this board. Returns what changed, for the event stream.
 */
export const seedListWidget = (type: string, config: string, boardId: Id): Resource[] => {
  const list = listKey(read(config));
  if (!list) return [];
  const scope = { board: boardId, list };
  const touched: Resource[] = [];
  if (type === "project.list") {
    if (ensureDefaultType(scope)) touched.push("lookups", "projects");
    // The "Priorités" labels (repositories/projects.ts).
    if (ensureProjectPriorities(scope)) touched.push("project-labels");
  }
  // The priorities and channels (repositories/support.ts).
  if (type === "support.list" && ensureSupportLabels(scope)) touched.push("support-labels");
  // The kind's default labels (repositories/declared-asset-labels.ts).
  const kind = type.split(".")[0];
  if (isDeclaredAssetKind(kind) && ensureDeclaredAssetLabels(type, scope)) {
    touched.push(DECLARED_ASSET_RESOURCES[kind]);
  }
  return touched;
};
