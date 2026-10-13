// Labels: those of a task board, set on its cards, their twins of a project
// board, set on its projects, and of a Support board, set on its requests, and
// those of a board's assets, shown on the machines whose GLPI tag they name. Same
// rules, four tables: the modes do not share their labels. Labels are a board's contexts (repositories/contexts.ts): any
// change re-reads the boards.
//
// One router serves both. They used to be two twin blocks of code in the old
// file; since both kinds of boards can be out of sight, only the table being
// queried still tells them apart.

import { Router } from "express";
import type { Request } from "express";
import type {
  CopyResult,
  DeclaredAssetKind,
  Id,
  Resource,
  Right,
  WidgetAccess,
} from "@milo/shared";
import {
  DECLARED_ASSET_KINDS,
  DECLARED_ASSET_RESOURCES,
  DEFAULT_LABEL_COLOR,
  DEFAULT_LABEL_GROUP,
  accessIncludes,
  declaredAssetListType,
  isLabelColor,
} from "@milo/shared";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type { LabelRow, NextRow } from "../db/rows.js";
import { require } from "../lib/rights.js";
import { widgetRights } from "../repositories/users.js";
import { HttpError, badRequest, orNotFound, refuseIfUsed, requireText } from "../lib/http.js";
import { concerned, notifyBoard, root } from "../lib/notify.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { openTaskBoard } from "../repositories/boards.js";
import { openBoard } from "../repositories/boards.js";
import {
  managedDeviceAssetLabelGroups,
  boardLabelGroups,
  projectLabelGroups,
  supportLabelGroups,
  declaredAssetLabelGroups,
  contactLabelGroups,
  productLabelGroups,
  orderLabelGroups,
  warehouseLabelGroups,
  locationLabelGroups,
} from "../repositories/label-groups.js";
import type { LabelGroupStore } from "../repositories/label-groups.js";
import { listInBoard } from "../repositories/lists.js";
import type { ListScope } from "../repositories/lists.js";
import { mountLabelGroups } from "./label-groups.js";

const LABEL_NOT_FOUND = "Étiquette introuvable";

/** The list that owns a label. */
const scopeOfRow = (label: LabelRow): ListScope => ({ board: label.board_id, list: label.list_key });

/** A declared asset kind's labels table (shared, declared-assets.ts). */
type DeclaredAssetLabels = `${DeclaredAssetKind}_labels`;

const GROUP_TABLES: Record<LabelTable["table"], string> = {
  labels: "label_groups",
  project_labels: "project_label_groups",
  managed_device_asset_labels: "managed_device_asset_label_groups",
  support_labels: "support_label_groups",
  contact_labels: "contact_label_groups",
  product_labels: "product_label_groups",
  order_labels: "order_label_groups",
  warehouse_labels: "warehouse_label_groups",
  location_labels: "location_label_groups",
  ...(Object.fromEntries(
    DECLARED_ASSET_KINDS.map((kind) => [`${kind}_labels`, `${kind}_label_groups`]),
  ) as Record<DeclaredAssetLabels, string>),
};

interface LabelTable {
  /** The table name. It only enters the SQL here, never from a request. */
  table:
    | "labels"
    | "project_labels"
    | "managed_device_asset_labels"
    | "support_labels"
    | "contact_labels"
    | "product_labels"
    | "order_labels"
    | "warehouse_labels"
    | "location_labels"
    | DeclaredAssetLabels;
  /** What the event stream must signal when these labels change. */
  touched: Resource[];
  /**
   * The board that carries these labels, if it is open to this person.
   * Throws otherwise, and returns the verified id — the copy needs both
   * sides, and doesn't want an id received as is.
   */
  verifyBoard: (boardId: unknown, req: Request, right: Right) => Id;
  /** The type of the list widgets that own these labels ("task.list"…). */
  listType: string;
  /** The groups of these labels (repositories/label-groups.ts). */
  groups: LabelGroupStore;
  /** What follows a change of these labels, once written. */
  changed?: () => void;
  /**
   * Who is told when these labels change, besides the author: those
   * concerned by the items that carry them (lib/notify.ts, `concerned`).
   */
  concernedBy: (boardId: Id) => Id[];
}

const createRoutes = ({
  table,
  touched,
  verifyBoard,
  listType,
  groups,
  changed = () => undefined,
  concernedBy,
}: LabelTable): Router => {
  /** A change of these labels, announced on their board. */
  const announce = (req: Request, boardId: Id | null | undefined, message: string): void => {
    if (!boardId) return;
    notifyBoard({ boardId, message, author: req.user, base: root(req), recipients: concernedBy(boardId) });
  };

  const groupTable = GROUP_TABLES[table];
  // With the name of their group: the lists title them by it.
  const byId = selection<LabelRow>(
    `SELECT l.*, g.name AS group_name FROM ${table} l
     LEFT JOIN ${groupTable} g ON g.id = l.group_id WHERE l.id = ?`,
  );
  const ofBoard = selection<LabelRow>(
    `SELECT l.*, g.name AS group_name FROM ${table} l
     LEFT JOIN ${groupTable} g ON g.id = l.group_id
     WHERE l.board_id = ? ORDER BY l.position, l.id`,
  );
  const ofListStatement = selection<LabelRow>(
    `SELECT l.*, g.name AS group_name FROM ${table} l
     LEFT JOIN ${groupTable} g ON g.id = l.group_id
     WHERE l.board_id = ? AND l.list_key = ? ORDER BY l.position, l.id`,
  );
  const ofList = (scope: ListScope) => ofListStatement.all(scope.board, scope.list);
  const nextRankStatement = scalar<NextRow>(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM ${table} WHERE board_id = ? AND list_key = ?`,
  );
  const nextRank = (scope: ListScope) => nextRankStatement(scope.board, scope.list);
  // Put last in the list, the label then takes its place at the end of its
  // group when positions are renumbered.
  const createStatement = mutation(
    `INSERT INTO ${table} (board_id, list_key, group_id, name, color, position, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const create = (scope: ListScope, group: Id, name: string, color: string, rank: number) =>
    createStatement.run(scope.board, scope.list, group, name, color, rank, now());
  const updateStatement = mutation(`UPDATE ${table} SET name = ?, color = ? WHERE id = ?`);
  // The label rewritten, and moved to the end of its new group if it changes.
  const update = transaction(
    (
      existing: LabelRow,
      { name, color, group }: { name: string; color: string; group: Id },
    ) => {
      updateStatement.run(name, color, existing.id);
      if (group !== existing.group_id) groups.moveTo(existing.id, group, scopeOfRow(existing));
    },
  );
  const withSameName = selection<LabelRow>(
    `SELECT * FROM ${table} WHERE board_id = ? AND list_key = ? AND name = ? COLLATE NOCASE LIMIT 1`,
  );
  const remove = mutation(`DELETE FROM ${table} WHERE id = ?`);
  // What carries the label: cards, projects, or requests. An asset label is
  // carried by no link: it only names a tag, and may always go.
  const uses = scalar<{ count: number }>(
    table === "labels"
      ? "SELECT COUNT(*) AS count FROM card_labels WHERE label_id = ?"
      : table === "project_labels"
        ? "SELECT COUNT(*) AS count FROM project_label_links WHERE label_id = ?"
        : table === "support_labels"
          ? "SELECT COUNT(*) AS count FROM support_request_labels WHERE label_id = ?"
          : table === "managed_device_asset_labels"
            ? "SELECT 0 AS count"
            : `SELECT COUNT(*) AS count FROM ${table.replace(/_labels$/, "_label_links")} WHERE label_id = ?`,
  );

  const clearFromList = mutation(`DELETE FROM ${table} WHERE board_id = ? AND list_key = ?`);

  /**
   * The labels of one list set on another. Those already bearing the same
   * name there are not duplicated, whatever their color: two labels with the
   * same name could no longer be told apart in a list. The others are put
   * after those of the destination. "replace": the destination's go first —
   * and leave whatever carried them.
   */
  const copy = transaction((source: ListScope, target: ListScope, replaceExisting: boolean): CopyResult => {
    const removed = replaceExisting ? clearFromList.run(target.board, target.list).changes : 0;
    if (replaceExisting) groups.clear(target);
    let rank = nextRank(target).next;
    let copied = 0;
    let skipped = 0;

    // Each label goes into the group of the same name, created if needed: read
    // in group order, the groups arrive in the source's order.
    for (const label of ofList(source)) {
      if (withSameName.get(target.board, target.list, label.name)) {
        skipped += 1;
        continue;
      }
      const group = groups.named(target, label.group_name ?? DEFAULT_LABEL_GROUP);
      create(target, group, label.name, label.color, rank);
      rank += 1;
      copied += 1;
    }
    groups.renumber(target);

    return { copied, skipped, removed };
  });

  /** The list a request names, once its board's access is checked. */
  const scopeOf = (req: Request, boardId: unknown, list: unknown, right: Right): ListScope =>
    listInBoard(verifyBoard(boardId, req, right), listType, list);

  const routes = Router();
  routes.use(touch("boards", ...touched));
  mountLabelGroups(
    routes,
    groups,
    scopeOf,
    (req, boardId, right) => verifyBoard(boardId, req, right),
    announce,
  );

  // Without a list, every label of the board: each carries its list key.
  routes.get("/", (req, res) => {
    const { board, list } = req.query;
    if (!board) badRequest("Le paramètre board est requis");
    if (list) {
      res.json(ofList(scopeOf(req, board, list, "view")));
      return;
    }
    res.json(ofBoard.all(verifyBoard(board, req, "view")));
  });

  routes.post("/", (req, res) => {
    const name = requireText(req.body.name, "Le nom de l'étiquette est requis");
    const boardId = req.body.board_id;
    const color = req.body.color || DEFAULT_LABEL_COLOR;
    if (!boardId) badRequest("Le tableau est requis");
    if (!isLabelColor(color)) badRequest("Couleur inconnue");
    const scope = scopeOf(req, boardId, req.body.list_key, "create");
    const group = groups.groupFor(scope, req.body.group_id);

    const { lastInsertRowid } = create(scope, group, name, color, nextRank(scope).next);
    groups.renumber(scope);
    changed();
    announce(req, scope.board, `a ajouté l'étiquette « ${name} »`);
    res.status(201).json(byId.get(lastInsertRowid));
  });

  // Declared before "/:id" is not necessary — the verbs differ —, but the
  // copy reads better next to the creation than at the end of the file.
  routes.post("/copy", (req, res) => {
    const { from_board, from_list, to_board, to_list } = req.body;
    if (!from_board || !to_board) {
      badRequest("Le tableau d'origine et celui de destination sont requis");
    }

    const replaceExisting = req.body.replace === true;
    const source = scopeOf(req, from_board, from_list, "view");
    const target = scopeOf(req, to_board, to_list, "create");
    // Erasing the destination's means deleting some.
    if (replaceExisting) verifyBoard(to_board, req, "delete");
    if (source.board === target.board && source.list === target.list) {
      badRequest("Choisissez un autre widget que celui-ci");
    }

    const result = copy(source, target, replaceExisting);
    changed();
    if (result.copied || result.removed) {
      announce(
        req,
        target.board,
        replaceExisting
          ? `a remplacé les étiquettes par celles d'un autre widget`
          : `a copié ${result.copied} étiquette${result.copied > 1 ? "s" : ""} d'un autre widget`,
      );
    }
    res.json(result);
  });

  routes.put("/:id", (req, res) => {
    const existing = orNotFound(byId.get(req.params.id), LABEL_NOT_FOUND);
    verifyBoard(existing.board_id, req, "update");

    const name = requireText(req.body.name ?? existing.name, "Le nom de l'étiquette est requis");
    const color = req.body.color ?? existing.color;
    if (!isLabelColor(color)) badRequest("Couleur inconnue");

    // Named, its group must be of the same board; the label goes at its end.
    const group =
      req.body.group_id === undefined
        ? existing.group_id
        : groups.groupFor(scopeOfRow(existing), req.body.group_id);

    update(existing, { name, color, group });
    changed();
    if (name !== existing.name) {
      announce(req, existing.board_id, `a renommé l'étiquette « ${existing.name} » en « ${name} »`);
    }
    if (color !== existing.color) {
      announce(req, existing.board_id, `a changé la couleur de l'étiquette « ${name} »`);
    }
    if (group !== existing.group_id) {
      announce(req, existing.board_id, `a changé le groupe de l'étiquette « ${name} »`);
    }
    res.json(byId.get(existing.id));
  });

  routes.delete("/:id", (req, res) => {
    const existing = orNotFound(byId.get(req.params.id), LABEL_NOT_FOUND);
    verifyBoard(existing.board_id, req, "delete");
    refuseIfUsed(existing.name, uses(existing.id).count);

    remove.run(existing.id);
    changed();
    announce(req, existing.board_id, `a supprimé l'étiquette « ${existing.name} »`);
    res.status(204).end();
  });

  return routes;
};

/** Labels of a task board: it may not be shared with everyone. */
export const labelRoutes = createRoutes({
  table: "labels",
  // Cards carry their labels: the board is re-read with them.
  touched: ["labels", "task-lists"],
  verifyBoard: (boardId, req, right) => openTaskBoard(boardId, req, right).id,
  listType: "task.list",
  groups: boardLabelGroups,
  concernedBy: concerned.board,
});

/** Labels of a project board: likewise. */
export const projectLabelRoutes = createRoutes({
  table: "project_labels",
  touched: ["project-labels", "projects"],
  // The project board belongs to no company: its labels follow the Projects
  // mode's rights in any of them.
  verifyBoard: (boardId, req, right) => {
    require(req, "projects", right);
    return openBoard(boardId, req.user).id;
  },
  listType: "project.list",
  groups: projectLabelGroups,
  concernedBy: concerned.projectBoard,
});

/** Labels of a Support board: they follow the Support mode's rights. */
export const supportLabelRoutes = createRoutes({
  table: "support_labels",
  // Requests carry their labels: they are re-read with them.
  touched: ["support-labels", "support-requests"],
  verifyBoard: (boardId, req, right) => {
    require(req, "support", right);
    return openBoard(boardId, req.user).id;
  },
  listType: "support.list",
  groups: supportLabelGroups,
  concernedBy: concerned.supportBoard,
});

/** The permission on an asset widget type that each right on its labels needs. */
const MANAGED_DEVICE_ASSET_LABEL_ACCESS: Record<Right, WidgetAccess> = {
  view: "view",
  create: "update",
  update: "update",
  delete: "delete",
};

/**
 * Labels of a board's assets: each shows on the machines whose GLPI tag
 * bears its name — the list's collectors, not its labels, bring them in.
 * The Assets mode is read-only — machines come from the inventory —, but its
 * labels are the board's settings: they follow the permission on the Asset
 * widget type.
 */
export const managedDeviceAssetLabelRoutes = createRoutes({
  table: "managed_device_asset_labels",
  touched: ["managed-device-assets"],
  verifyBoard: (boardId, req, right) => {
    const access = MANAGED_DEVICE_ASSET_LABEL_ACCESS[right];
    if (!accessIncludes(widgetRights(req.user).managed_device_asset, access)) {
      throw right === "view"
        ? new HttpError(404, "Introuvable")
        : new HttpError(403, "Vous n'avez pas le droit de modifier ici");
    }
    return openBoard(boardId, req.user).id;
  },
  listType: "managed_device_asset.list",
  groups: managedDeviceAssetLabelGroups,
  // Machines are followed by no one: only the author, if they asked to.
  concernedBy: () => [],
});

/**
 * Labels of a board's declared assets of one kind: the board's own, named by
 * no tag. Like the managed device asset labels, they follow the permission on
 * their widget type.
 */
export const declaredAssetLabelRoutes = (kind: DeclaredAssetKind) =>
  createRoutes({
    table: `${kind}_labels`,
    // The assets carry their labels: they are re-read with them.
    touched: [DECLARED_ASSET_RESOURCES[kind]],
    verifyBoard: (boardId, req, right) => {
      if (!accessIncludes(widgetRights(req.user)[kind], MANAGED_DEVICE_ASSET_LABEL_ACCESS[right])) {
        throw right === "view"
          ? new HttpError(404, "Introuvable")
          : new HttpError(403, "Vous n'avez pas le droit de modifier ici");
      }
      return openBoard(boardId, req.user).id;
    },
    listType: declaredAssetListType(kind),
    groups: declaredAssetLabelGroups[kind],
    concernedBy: () => [],
  });

/**
 * Labels of a board's contacts: the board's own. Like the declared assets',
 * they follow the permission on their widget type ("Logistique").
 */
export const contactLabelRoutes = createRoutes({
  table: "contact_labels",
  // The contacts carry their labels: they are re-read with them.
  touched: ["contacts"],
  verifyBoard: (boardId, req, right) => {
    if (!accessIncludes(widgetRights(req.user).logistics, MANAGED_DEVICE_ASSET_LABEL_ACCESS[right])) {
      throw right === "view"
        ? new HttpError(404, "Introuvable")
        : new HttpError(403, "Vous n'avez pas le droit de modifier ici");
    }
    return openBoard(boardId, req.user).id;
  },
  listType: "contact.list",
  groups: contactLabelGroups,
  concernedBy: () => [],
});

/** The "Logistique" permission a product label needs. */
const logisticsBoard = (boardId: unknown, req: Request, right: Right): Id => {
  if (!accessIncludes(widgetRights(req.user).logistics, MANAGED_DEVICE_ASSET_LABEL_ACCESS[right])) {
    throw right === "view"
      ? new HttpError(404, "Introuvable")
      : new HttpError(403, "Vous n'avez pas le droit de modifier ici");
  }
  return openBoard(boardId, req.user).id;
};

/** Labels of a board's products: the board's own, like the contacts'. */
export const productLabelRoutes = createRoutes({
  table: "product_labels",
  // The products carry their labels: they are re-read with them.
  touched: ["products"],
  verifyBoard: logisticsBoard,
  listType: "product.list",
  groups: productLabelGroups,
  concernedBy: () => [],
});

/** Labels of a board's orders: the board's own, like the products'. */
export const orderLabelRoutes = createRoutes({
  table: "order_labels",
  // The orders carry their labels: they are re-read with them.
  touched: ["orders"],
  verifyBoard: logisticsBoard,
  listType: "order.list",
  groups: orderLabelGroups,
  concernedBy: () => [],
});

/** Labels of a board's warehouses: the board's own, like the products'. */
export const warehouseLabelRoutes = createRoutes({
  table: "warehouse_labels",
  // The warehouses carry their labels: they are re-read with them.
  touched: ["warehouses"],
  verifyBoard: logisticsBoard,
  listType: "warehouse.list",
  groups: warehouseLabelGroups,
  concernedBy: () => [],
});

/** Labels of a board's locations: the board's own, like the warehouses'. */
export const locationLabelRoutes = createRoutes({
  table: "location_labels",
  // The locations carry their labels: they are re-read with them.
  touched: ["locations"],
  verifyBoard: logisticsBoard,
  listType: "location.list",
  groups: locationLabelGroups,
  concernedBy: () => [],
});
