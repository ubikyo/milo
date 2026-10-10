// The label templates of a board's asset widgets, kind by kind (shared,
// label-templates.ts): a name, a paper format, and the ZPL its printer takes.
// They are not a widget's configuration but the board's, as its asset lists;
// like those, they follow the permission on the widget type.
//
// Their variables are the asset's number and the names of the kind's label
// groups: "{{label.Site}}" takes the asset's label in the group "Site". The
// preview asks the format's printer to draw the label (lib/zebra.ts); the
// test prints it, with a number drawn at random and one of the labels of each
// group the template names. An asset's label prints a saved template with
// its number and its labels.

import { Router } from "express";
import type { Request } from "express";
import {
  ASSET_NUMBER_VARIABLE,
  LABEL_TEMPLATE_NAME_MAX,
  accessIncludes,
  isLabelTemplateKind,
  labelGroupVariable,
} from "@milo/shared";
import type {
  Id,
  LabelPreview,
  LabelTemplate,
  LabelTemplateKind,
  LabelTemplates,
  LabelTestPrint,
  Printer,
} from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import type { PrinterRow } from "../db/rows.js";
import { HttpError, badRequest, fail } from "../lib/http.js";
import { MAX_ZPL_LENGTH, printZpl, renderZpl } from "../lib/zebra.js";
import { toPrinter } from "./printers.js";
import { declaredAssetTables } from "../db/declared-asset-tables.js";
import { openBoard, requireBoardControl } from "../repositories/boards.js";
import { widgetRights } from "../repositories/users.js";

/** A board holds this many templates of a kind at most. */
const TEMPLATES_MAX = 100;

/** The number the preview shows; the test draws one. */
const SAMPLE_NUMBER = "12345";
const TEST_NUMBER_MAX = 99999;

const read = selection<{ templates: string }>(
  "SELECT templates FROM board_label_templates WHERE board_id = ? AND kind = ?",
);
const write = mutation(
  `INSERT INTO board_label_templates (board_id, kind, templates) VALUES (?, ?, ?)
   ON CONFLICT (board_id, kind) DO UPDATE SET templates = excluded.templates`,
);
const formatExists = selection<{ id: Id }>("SELECT id FROM paper_formats WHERE id = ?");
const printerOfFormat = selection<PrinterRow & { format: string }>(
  `SELECT p.*, f.name AS format FROM paper_formats f
   LEFT JOIN printers p ON p.id = f.printer_id WHERE f.id = ?`,
);

/** The kind's label groups, in their order, with their labels in theirs. */
export const groupsOf = (kind: LabelTemplateKind, boardId: Id) => {
  // The table names come from the kind, checked against the list, never from
  // the request as is.
  const groups = selection<{ id: Id; name: string }>(
    `SELECT id, name FROM ${kind}_label_groups WHERE board_id = ? ORDER BY position, id`,
  ).all(boardId);
  const labels = selection<{ group_id: Id; name: string }>(
    `SELECT group_id, name FROM ${kind}_labels WHERE board_id = ? ORDER BY position, id`,
  ).all(boardId);
  return groups.map((g) => ({
    name: g.name,
    labels: labels.filter((l) => l.group_id === g.id).map((l) => l.name),
  }));
};

const parsed = (saved: string | undefined): LabelTemplate[] => {
  if (!saved) return [];
  try {
    const list = JSON.parse(saved) as unknown;
    return Array.isArray(list) ? (list as LabelTemplate[]) : [];
  } catch {
    return [];
  }
};

const templatesOf = (kind: LabelTemplateKind, boardId: Id): LabelTemplates => ({
  // A deleted paper format leaves its templates without one.
  templates: parsed(read.get(boardId, kind)?.templates).map((t) => ({
    ...t,
    paper_format_id:
      t.paper_format_id !== null && formatExists.get(t.paper_format_id) ? t.paper_format_id : null,
  })),
  variables: [
    { group: "Asset", label: "Numéro", name: ASSET_NUMBER_VARIABLE },
    ...groupsOf(kind, boardId).map((g) => ({
      group: "Étiquettes",
      label: g.name,
      name: labelGroupVariable(g.name),
    })),
  ],
});

/** An asset: its board, its number, and the names of its labels with their groups'. */
interface PrintedAsset {
  board_id: Id | null;
  name: string;
  labels: { name: string; group_name: string | null }[];
}

/**
 * The asset of a kind. A supervised device carries the label named as its
 * tag, case aside; a declared asset, those linked to it.
 */
const assetOf = (kind: LabelTemplateKind, id: unknown): PrintedAsset | undefined => {
  if (kind === "managed_device_asset") {
    const row = selection<{ board_id: Id | null; name: string; tag: string }>(
      "SELECT board_id, name, tag FROM managed_device_assets WHERE id = ?",
    ).get(id);
    if (!row) return undefined;
    const labels = row.tag.trim()
      ? selection<{ name: string; group_name: string | null }>(
          `SELECT l.name, g.name AS group_name FROM managed_device_asset_labels l
           LEFT JOIN managed_device_asset_label_groups g ON g.id = l.group_id
           WHERE l.board_id = ? AND lower(trim(l.name)) = lower(trim(?))
           ORDER BY l.position, l.id`,
        ).all(row.board_id, row.tag)
      : [];
    return { board_id: row.board_id, name: row.name, labels };
  }
  const t = declaredAssetTables(kind);
  const row = selection<{ board_id: Id; name: string }>(
    `SELECT board_id, name FROM ${t.assets} WHERE id = ?`,
  ).get(id);
  if (!row) return undefined;
  const labels = selection<{ name: string; group_name: string | null }>(
    `SELECT l.name, g.name AS group_name FROM ${t.labelLinks} k
     JOIN ${t.labels} l ON l.id = k.label_id
     LEFT JOIN ${t.labelGroups} g ON g.id = l.group_id
     WHERE k.asset_id = ? ORDER BY l.position, l.id`,
  ).all(id);
  return { ...row, labels };
};

/** The kind named by the path. */
const kindOf = (req: Request): LabelTemplateKind =>
  isLabelTemplateKind(req.params.kind) ? req.params.kind : fail(404, "Type d'asset inconnu");

/**
 * The board named by "?board=", if this person sees it — and, to change its
 * templates, may modify the kind's widgets.
 */
export const verifyBoard = (req: Request, kind: LabelTemplateKind, write: boolean): Id => {
  if (write && !accessIncludes(widgetRights(req.user)[kind], "update")) {
    throw new HttpError(403, "Vous n'avez pas le droit de modifier ici");
  }
  const board = openBoard(req.query.board, req.user);
  if (write) requireBoardControl(board, req.user);
  return board.id;
};

const readZpl = (value: unknown): string => {
  const zpl = typeof value === "string" ? value : "";
  if (zpl.length > MAX_ZPL_LENGTH) badRequest("Modèle d'étiquette trop volumineux");
  return zpl;
};

/** The list, as sent: empty rows left out, a name only once, case aside. */
const readTemplates = (received: unknown): LabelTemplate[] => {
  if (!Array.isArray(received)) badRequest("Les modèles d'étiquette sont une liste");
  const seen = new Set<string>();
  const list: LabelTemplate[] = [];
  for (const entry of received as unknown[]) {
    const row = (entry ?? {}) as Record<string, unknown>;
    const name = String(row.name ?? "").trim();
    if (!name) continue;
    if (name.length > LABEL_TEMPLATE_NAME_MAX) {
      badRequest(`Un nom tient en ${LABEL_TEMPLATE_NAME_MAX} caractères`);
    }
    const key = name.toLowerCase();
    if (seen.has(key)) badRequest(`« ${name} » figure deux fois`);
    seen.add(key);
    const format = row.paper_format_id == null ? null : Number(row.paper_format_id);
    if (format !== null && !formatExists.get(format)) {
      badRequest(`Le format d'étiquette du modèle « ${name} » n'existe pas`);
    }
    list.push({ name, paper_format_id: format, zpl: readZpl(row.zpl) });
  }
  if (list.length > TEMPLATES_MAX) badRequest(`Un tableau tient en ${TEMPLATES_MAX} modèles`);
  return list;
};

/** The printer of a paper format: required to preview or print. */
const printerFor = (formatId: unknown): Printer => {
  if (formatId == null) badRequest("Choisissez d'abord le format d'étiquette du modèle");
  const row = printerOfFormat.get(Number(formatId)) ?? badRequest("Format d'étiquette introuvable");
  if (row.id == null) badRequest(`Le format « ${row.format} » n'a pas d'imprimante`);
  return toPrinter({ ...row, id: row.id });
};

/**
 * A text in a ZPL field: "^" and "~" would start a command — they are
 * dropped.
 */
const zplText = (text: string): string => text.replace(/[\^~]/g, "");

/**
 * The template filled: the number, and each group's label — the one
 * `pick` chooses among its labels; none, empty.
 */
const filled = (
  zpl: string,
  number: string,
  groups: { name: string; labels: string[] }[],
  pick: (labels: string[]) => string | undefined,
): string => {
  const byName = new Map(groups.map((g) => [g.name.toLowerCase(), g.labels]));
  return zpl
    .replace(/\{\{\s*asset\.number\s*\}\}/g, number)
    .replace(/\{\{\s*label\.([^{}]+?)\s*\}\}/g, (_, group: string) =>
      zplText(pick(byName.get(group.toLowerCase()) ?? []) ?? ""),
    );
};

/** The ZPL of a preview or test: something to draw, and its printer. */
const job = (req: Request) => {
  const zpl = readZpl(req.body?.zpl);
  if (!zpl.trim()) badRequest("Le modèle est vide");
  return { zpl, printer: printerFor(req.body?.paper_format_id) };
};

const randomOf = (labels: string[]): string | undefined =>
  labels[Math.floor(Math.random() * labels.length)];

/** Several labels of a group, one after the other. */
const joined = (labels: string[]): string | undefined => labels.join(", ") || undefined;

export const labelTemplateRoutes = Router();

labelTemplateRoutes.get("/:kind", (req, res) => {
  const kind = kindOf(req);
  res.json(templatesOf(kind, verifyBoard(req, kind, false)));
});

/** The list is replaced entirely. */
labelTemplateRoutes.put("/:kind", (req, res) => {
  const kind = kindOf(req);
  const boardId = verifyBoard(req, kind, true);
  write.run(boardId, kind, JSON.stringify(readTemplates(req.body?.templates)));
  res.json(templatesOf(kind, boardId));
});

/**
 * The label as the printer draws it, filled with a sample: the first label of
 * each group. Nothing is printed.
 */
labelTemplateRoutes.post("/:kind/preview", (req, res, next) => {
  const kind = kindOf(req);
  const boardId = verifyBoard(req, kind, false);
  const { zpl, printer } = job(req);
  const groups = groupsOf(kind, boardId);
  renderZpl(printer, filled(zpl, SAMPLE_NUMBER, groups, (labels) => labels[0]))
    .then((png) => {
      const preview: LabelPreview = { image: `data:image/png;base64,${png.toString("base64")}` };
      res.json(preview);
    })
    .catch(next);
});

/**
 * A test label, printed: a number drawn at random, and for each group the
 * template names, one of its labels.
 */
labelTemplateRoutes.post("/:kind/print", (req, res, next) => {
  const kind = kindOf(req);
  const boardId = verifyBoard(req, kind, false);
  const { zpl, printer } = job(req);
  const number = String(1 + Math.floor(Math.random() * TEST_NUMBER_MAX));
  printZpl(printer, filled(zpl, number, groupsOf(kind, boardId), randomOf))
    .then(() => {
      const sent: LabelTestPrint = { printer: printer.name };
      res.json(sent);
    })
    .catch(next);
});

/**
 * An asset's label: the template of this name, among those of the asset's
 * board, filled with its number and, for each group, its labels in it.
 */
labelTemplateRoutes.post("/:kind/assets/:id/print", (req, res, next) => {
  const kind = kindOf(req);
  const missing = "Asset introuvable";
  if (!accessIncludes(widgetRights(req.user)[kind], "view")) fail(404, missing);
  const asset = assetOf(kind, req.params.id) ?? fail(404, missing);
  if (asset.board_id === null) fail(404, missing);
  const boardId = openBoard(asset.board_id, req.user).id;
  const number = zplText(asset.name.trim());
  if (!number) badRequest("L'asset n'a pas de numéro");
  const name = String(req.body?.name ?? "");
  const template =
    templatesOf(kind, boardId).templates.find((t) => t.name === name) ??
    fail(404, `Le modèle « ${name} » n'existe plus`);
  if (!template.zpl.trim()) badRequest(`Le modèle « ${name} » est vide`);
  const printer = printerFor(template.paper_format_id);
  const groups = groupsOf(kind, boardId).map((g) => ({
    name: g.name,
    labels: asset.labels.filter((l) => l.group_name === g.name).map((l) => l.name),
  }));
  printZpl(printer, filled(template.zpl, number, groups, joined))
    .then(() => {
      const sent: LabelTestPrint = { printer: printer.name };
      res.json(sent);
    })
    .catch(next);
});
