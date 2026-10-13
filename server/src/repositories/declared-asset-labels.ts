// The default labels of the declared assets (shared, DECLARED_ASSET_DEFAULT_LABELS):
// each widget of a kind brings its own, group by group, as a Support widget
// does (repositories/support.ts).

import { DECLARED_ASSET_DEFAULT_LABELS, isDeclaredAssetKind } from "@milo/shared";
import type { DeclaredAssetKind } from "@milo/shared";
import { declaredAssetTables } from "../db/declared-asset-tables.js";
import { mutation, scalar, transaction } from "../db/query.js";
import { declaredAssetLabelGroups } from "./label-groups.js";
import type { ListScope } from "./lists.js";

const statements = (kind: DeclaredAssetKind) => {
  const { labels, labelGroups } = declaredAssetTables(kind);
  return {
    // A label or a group already there: the widget has chosen its own.
    existing: scalar<{ count: number }>(
      `SELECT (SELECT COUNT(*) FROM ${labels} WHERE board_id = @board AND list_key = @list)
            + (SELECT COUNT(*) FROM ${labelGroups} WHERE board_id = @board AND list_key = @list)
              AS count`,
    ),
    create: mutation(
      `INSERT INTO ${labels} (board_id, list_key, group_id, name, color, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ),
  };
};

const BY_KIND = {
  unmanaged_device_asset: statements("unmanaged_device_asset"),
  application_asset: statements("application_asset"),
};

/**
 * The default labels of a widget type, in a widget that has none yet: each
 * widget has its own. True when they were created.
 */
export const ensureDeclaredAssetLabels = transaction((type: string, scope: ListScope): boolean => {
  const kind = type.split(".")[0];
  if (!isDeclaredAssetKind(kind) || DECLARED_ASSET_DEFAULT_LABELS[kind].length === 0) return false;
  if (!scope.list) return false;
  const { existing, create } = BY_KIND[kind];
  if (existing(scope).count > 0) return false;
  const groups = declaredAssetLabelGroups[kind];
  const instant = new Date().toISOString();
  let position = 0;
  for (const { group, labels } of DECLARED_ASSET_DEFAULT_LABELS[kind]) {
    const groupId = groups.named(scope, group);
    for (const label of labels) {
      create.run(scope.board, scope.list, groupId, label.name, label.color, position++, instant);
    }
  }
  groups.renumber(scope);
  return true;
});
