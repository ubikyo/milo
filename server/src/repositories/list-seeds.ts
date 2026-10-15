// What a new list widget brings with it: its own default labels, and for a
// "Projets" widget its "Défaut" milestone type. Each list widget owns its
// settings (repositories/lists.ts, ListScope): they are seeded for its key,
// whatever the board's other widgets carry.

import { DECLARED_ASSET_RESOURCES, isDeclaredAssetKind, listKey } from "@milo/shared";
import type { Id, Resource } from "@milo/shared";
import { ensureDefaultType } from "../routes/milestone-types.js";
import { ensureDeclaredAssetDefaults, withDeclaredAssetColumns } from "./declared-asset-defaults.js";
import { ensureDeclaredAssetLabels } from "./declared-asset-labels.js";
import { ensureProjectPriorities, withProjectPriorityColumn } from "./projects.js";
import { ensureSupportLabels, withSupportColumns } from "./support.js";
import { boardWidgets } from "./board-widgets.js";
import { ensureDefaultReplies } from "../routes/support-replies.js";

const read = (config: string): unknown => {
  try {
    return JSON.parse(config) as unknown;
  } catch {
    return {};
  }
};

/**
 * Seeds the widget just created (its key already given), in this board.
 * Returns what changed, for the event stream.
 */
export const seedListWidget = (
  { id, type, config }: { id: Id; type: string; config: string },
  boardId: Id,
): Resource[] => {
  const list = listKey(read(config));
  if (!list) return [];
  const scope = { board: boardId, list };
  const touched: Resource[] = [];
  if (type === "project.list") {
    if (ensureDefaultType(scope)) touched.push("lookups", "projects");
    // The "Priorité" labels (repositories/projects.ts), and the column that
    // shows them.
    if (ensureProjectPriorities(scope)) {
      touched.push("project-labels");
      const columns = withProjectPriorityColumn(read(config), scope);
      if (columns) boardWidgets.update.run(JSON.stringify(columns), id);
    }
  }
  // The priorities and channels (repositories/support.ts), and the columns
  // that show them — only now are their groups known.
  if (type === "support.list" && ensureSupportLabels(scope)) {
    touched.push("support-labels");
    const columns = withSupportColumns(read(config), scope);
    if (columns) boardWidgets.update.run(JSON.stringify(columns), id);
  }
  // Its automatic replies (shared, SUPPORT_DEFAULT_REPLIES).
  if (type === "support.list") ensureDefaultReplies(scope);
  // The kind's default labels (repositories/declared-asset-labels.ts), and
  // the columns that show them; its lists and asset number template
  // (repositories/declared-asset-defaults.ts).
  const kind = type.split(".")[0];
  if (isDeclaredAssetKind(kind) && type.endsWith(".list")) {
    ensureDeclaredAssetDefaults(kind, scope);
    ensureDeclaredAssetLabels(type, scope);
    const columns = withDeclaredAssetColumns(kind, read(config), scope);
    if (columns) boardWidgets.update.run(JSON.stringify(columns), id);
    touched.push(DECLARED_ASSET_RESOURCES[kind]);
  }
  return touched;
};
