// Label groups: every label belongs to one, and the groups are ordered among
// themselves. The four kinds of labels — those of cards, of projects, of
// assets, of Support — each have their own groups table, bounded by the list
// widget that owns them: its board, and its list key.
//
// The labels' "position" orders the whole set, group after group: it is
// renumbered whenever a group moves or a label changes group. Every query that
// reads labels "ORDER BY position" thus gets them in group order, without
// joining the groups.

import { DECLARED_ASSET_KINDS, DEFAULT_LABEL_GROUP } from "@milo/shared";
import type { DeclaredAssetKind, Id, LabelGroup, LabelGroupLayout } from "@milo/shared";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type { IdRow, NextRow } from "../db/rows.js";
import { badRequest, toIds } from "../lib/http.js";
import { now } from "../lib/time.js";
import type { ListScope } from "./lists.js";
import { receivedOrder } from "./reorder.js";

interface Tables {
  /** The labels table. Table names come from here, never from a request. */
  labels:
    | "labels"
    | "project_labels"
    | "support_labels"
    | "managed_device_asset_labels"
    | "contact_labels"
    | "product_labels"
    | "order_labels"
    | "warehouse_labels"
    | "location_labels"
    | `${DeclaredAssetKind}_labels`;
  groups:
    | "label_groups"
    | "project_label_groups"
    | "support_label_groups"
    | "managed_device_asset_label_groups"
    | "contact_label_groups"
    | "product_label_groups"
    | "order_label_groups"
    | "warehouse_label_groups"
    | "location_label_groups"
    | `${DeclaredAssetKind}_label_groups`;
}

/**
 * The scope of a set: the list widget that owns it (repositories/lists.ts,
 * ListScope) — its board, and its list key.
 */
type Scope = ListScope;

const store = ({ labels, groups }: Tables) => {
  const where = " WHERE board_id = ? AND list_key = ?";
  const and = " AND board_id = ? AND list_key = ?";
  const params = (scope: Scope): unknown[] => [scope.board, scope.list];

  const ofScope = selection<LabelGroup>(`SELECT * FROM ${groups}${where} ORDER BY position, id`);
  const ofBoard = selection<LabelGroup>(
    `SELECT * FROM ${groups} WHERE board_id = ? ORDER BY position, id`,
  );
  const byId = selection<LabelGroup>(`SELECT * FROM ${groups} WHERE id = ?`);
  const byName = selection<LabelGroup>(
    `SELECT * FROM ${groups} WHERE name = ? COLLATE NOCASE${and} ORDER BY position, id LIMIT 1`,
  );
  const nextRank = scalar<NextRow>(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM ${groups}${where}`,
  );
  const insert = mutation(
    `INSERT INTO ${groups} (board_id, list_key, name, position, created_at) VALUES (?, ?, ?, ?, ?)`,
  );
  const renameStatement = mutation(`UPDATE ${groups} SET name = ? WHERE id = ?`);
  const removeStatement = mutation(`DELETE FROM ${groups} WHERE id = ?`);
  const clearStatement = mutation(`DELETE FROM ${groups}${where}`);
  const labelCount = scalar<{ count: number }>(
    `SELECT COUNT(*) AS count FROM ${labels} WHERE group_id = ?`,
  );
  const labelsOfScope = selection<IdRow>(`SELECT id FROM ${labels}${where} ORDER BY position, id`);
  const flatOrder = selection<IdRow>(
    `SELECT l.id FROM ${labels} l JOIN ${groups} g ON g.id = l.group_id
     WHERE l.board_id = ? AND l.list_key = ?
     ORDER BY g.position, g.id, l.position, l.id`,
  );
  const placeLabel = mutation(`UPDATE ${labels} SET position = ? WHERE id = ?`);
  const placeGroup = mutation(`UPDATE ${groups} SET position = ? WHERE id = ?`);
  const moveLabel = mutation(`UPDATE ${labels} SET group_id = ?, position = ? WHERE id = ?`);
  const nextLabelRank = scalar<NextRow>(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM ${labels} WHERE group_id = ?`,
  );

  /** A new group, after the others. */
  const create = (scope: Scope, name: string): Id => {
    const { next } = nextRank(...params(scope));
    const { lastInsertRowid } = insert.run(scope.board, scope.list, name, next, now());
    return Number(lastInsertRowid);
  };

  /** The labels' positions, renumbered group after group. */
  const renumber = (scope: Scope): void => {
    flatOrder.all(...params(scope)).forEach(({ id }, rank) => placeLabel.run(rank, id));
  };

  return {
    ofScope: (scope: Scope) => ofScope.all(...params(scope)),
    /** Every group of a board, whatever its list: each carries its list key. */
    ofBoard: (boardId: Id) => ofBoard.all(boardId),
    byId: (id: unknown) => byId.get(id),
    create,
    rename: (id: Id, name: string) => renameStatement.run(name, id),
    remove: (id: Id) => removeStatement.run(id),
    /** Every group of the set: those of a list whose labels are replaced. */
    clear: (scope: Scope) => clearStatement.run(...params(scope)),
    labelCount: (id: Id) => labelCount(id).count,
    renumber,

    /** The group bearing this name, created after the others if missing. */
    named: (scope: Scope, name: string): Id =>
      byName.get(name, ...params(scope))?.id ?? create(scope, name),

    /**
     * The group named by a request for a label: one of this set. Without one,
     * the first group, created when there is none yet.
     */
    groupFor: (scope: Scope, value: unknown): Id => {
      if (value === undefined || value === null || value === "") {
        return ofScope.get(...params(scope))?.id ?? create(scope, DEFAULT_LABEL_GROUP);
      }
      const group = byId.get(value);
      if (!group || group.board_id !== scope.board || group.list_key !== scope.list) {
        badRequest("Groupe inconnu");
      }
      return group!.id;
    },

    /** A label moved to another group: it goes at the end of it. */
    moveTo: (labelId: Id, groupId: Id, scope: Scope): void => {
      moveLabel.run(groupId, nextLabelRank(groupId).next, labelId);
      renumber(scope);
    },

    /**
     * The received arrangement, validated: every group of the set, each once,
     * and in them every label of the set, each once.
     */
    receivedLayout: (value: unknown, scope: Scope): LabelGroupLayout[] => {
      if (!Array.isArray(value)) badRequest("groups doit être un tableau");
      const received = value as { id?: unknown; label_ids?: unknown }[];
      if (received.some((g) => !Array.isArray(g?.label_ids))) {
        badRequest("label_ids doit être un tableau");
      }
      const layout = received.map((g) => ({ id: Number(g.id), label_ids: toIds(g.label_ids) }));
      receivedOrder(
        layout.map((g) => g.id),
        ofScope.all(...params(scope)),
        "L'ordre doit nommer chaque groupe une fois",
      );
      receivedOrder(
        layout.flatMap((g) => g.label_ids),
        labelsOfScope.all(...params(scope)),
        "L'ordre doit nommer chaque étiquette une fois",
      );
      return layout;
    },

    /** Groups and labels take the received order; labels may change group. */
    arrange: transaction((scope: Scope, layout: LabelGroupLayout[]) => {
      layout.forEach((group, rank) => {
        placeGroup.run(rank, group.id);
        group.label_ids.forEach((id, place) => moveLabel.run(group.id, place, id));
      });
      renumber(scope);
    }),
  };
};

export type LabelGroupStore = ReturnType<typeof store>;

/** The groups of a task board's labels. */
export const boardLabelGroups = store({ labels: "labels", groups: "label_groups" });

/** The groups of a projects board's labels. */
export const projectLabelGroups = store({
  labels: "project_labels",
  groups: "project_label_groups"
});

/** The groups of a board's managed device asset labels. */
export const managedDeviceAssetLabelGroups = store({
  labels: "managed_device_asset_labels",
  groups: "managed_device_asset_label_groups"
});

/** The groups of a board's declared asset labels, kind by kind. */
export const declaredAssetLabelGroups = Object.fromEntries(
  DECLARED_ASSET_KINDS.map((kind) => [
    kind,
    store({ labels: `${kind}_labels`, groups: `${kind}_label_groups` }),
  ]),
) as Record<DeclaredAssetKind, ReturnType<typeof store>>;

/** The groups of a board's contact labels. */
export const contactLabelGroups = store({
  labels: "contact_labels",
  groups: "contact_label_groups"
});

/** The groups of a board's product labels. */
export const productLabelGroups = store({
  labels: "product_labels",
  groups: "product_label_groups"
});

/** The groups of a board's warehouse labels. */
export const warehouseLabelGroups = store({
  labels: "warehouse_labels",
  groups: "warehouse_label_groups"
});

/** The groups of a board's location labels. */
export const locationLabelGroups = store({
  labels: "location_labels",
  groups: "location_label_groups"
});

/** The groups of a board's order labels. */
export const orderLabelGroups = store({
  labels: "order_labels",
  groups: "order_label_groups"
});

/** The groups of a board's Support labels. */
export const supportLabelGroups = store({
  labels: "support_labels",
  groups: "support_label_groups"
});
