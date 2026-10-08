// The default labels of the declared assets (shared, DECLARED_ASSET_DEFAULT_LABELS):
// a board's first widget of a kind brings them, group by group, as a Support
// widget brings its own (repositories/support.ts).

import { DECLARED_ASSET_DEFAULT_LABELS, isDeclaredAssetKind } from "@milo/shared";
import type { DeclaredAssetKind, Id } from "@milo/shared";
import { declaredAssetTables } from "../db/declared-asset-tables.js";
import { mutation, scalar, transaction } from "../db/query.js";
import { declaredAssetLabelGroups } from "./label-groups.js";

const statements = (kind: DeclaredAssetKind) => {
  const { labels, labelGroups } = declaredAssetTables(kind);
  return {
    // A label or a group already there: the board has chosen its own.
    existing: scalar<{ count: number }>(
      `SELECT (SELECT COUNT(*) FROM ${labels} WHERE board_id = @board)
            + (SELECT COUNT(*) FROM ${labelGroups} WHERE board_id = @board) AS count`,
    ),
    create: mutation(
      `INSERT INTO ${labels} (board_id, group_id, name, color, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ),
  };
};

const BY_KIND = {
  unmanaged_device_asset: statements("unmanaged_device_asset"),
  application_asset: statements("application_asset"),
};

/**
 * The default labels of a widget type, on a board that has none of its kind
 * yet; the board's widgets of the kind share them. True when they were created.
 */
export const ensureDeclaredAssetLabels = transaction((type: string, boardId: Id): boolean => {
  const kind = type.split(".")[0];
  if (!isDeclaredAssetKind(kind) || DECLARED_ASSET_DEFAULT_LABELS[kind].length === 0) return false;
  const { existing, create } = BY_KIND[kind];
  if (existing({ board: boardId }).count > 0) return false;
  const groups = declaredAssetLabelGroups[kind];
  const instant = new Date().toISOString();
  let position = 0;
  for (const { group, labels } of DECLARED_ASSET_DEFAULT_LABELS[kind]) {
    const groupId = groups.named(boardId, group);
    for (const label of labels) {
      create.run(boardId, groupId, label.name, label.color, position++, instant);
    }
  }
  groups.renumber(boardId);
  return true;
});
