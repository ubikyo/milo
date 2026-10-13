// The label templates of an asset widget (shared, label-templates.ts): a
// name, a paper format, and the ZPL its printer takes. They are not its
// configuration but its own data (ListScope), as its asset lists; like those,
// they follow the permission on the widget type.
//
// Their variables are the asset's number and the names of the kind's label
// groups: "{{label.Site}}" takes the asset's label in the group "Site". A
// location's (shared, locations.ts) take its place's code, name, type and
// path instead of a number; they follow the permission on "Logistique". The
// preview asks the format's printer to draw the label (lib/zebra.ts); the
// test prints it, with a number drawn at random and one of the labels of each
// group the template names. An asset's label prints a saved template with
// its number and its labels.

import { Router } from "express";
import type { Request } from "express";
import {
  ASSET_NUMBER_VARIABLE,
  LABEL_TEMPLATE_NAME_MAX,
  LOCATION_LABEL_VARIABLES,
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
  MailTemplateVariable,
  Printer,
  WidgetKind,
} from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import type { PrinterRow } from "../db/rows.js";
import { HttpError, badRequest, fail } from "../lib/http.js";
import { MAX_ZPL_LENGTH, printZpl, renderZpl } from "../lib/zebra.js";
import { toPrinter } from "./printers.js";
import { declaredAssetTables } from "../db/declared-asset-tables.js";
import { openBoard, requireBoardControl } from "../repositories/boards.js";
import { listInBoard } from "../repositories/lists.js";
import type { ListScope } from "../repositories/lists.js";
import { widgetRights } from "../repositories/users.js";

/** A widget holds this many templates at most. */
const TEMPLATES_MAX = 100;

/** The number the preview shows; the test draws one. */
const SAMPLE_NUMBER = "12345";
const TEST_NUMBER_MAX = 99999;

/** The place a location's preview and test show. */
const SAMPLE_PLACE = { name: "Allée A", type: "Interne", path: "Entrepôt > Allée A" };

/** The permission a kind follows: a location's, "Logistique". */
const rightsKind = (kind: LabelTemplateKind): WidgetKind => (kind === "location" ? "logistics" : kind);

/** A kind's own variables: an asset's number, a location's place. */
const ownVariables = (kind: LabelTemplateKind): MailTemplateVariable[] =>
  kind === "location"
    ? [
        { group: "Emplacement", label: "Code", name: LOCATION_LABEL_VARIABLES.code },
        { group: "Emplacement", label: "Nom", name: LOCATION_LABEL_VARIABLES.name },
        { group: "Emplacement", label: "Type", name: LOCATION_LABEL_VARIABLES.type },
        { group: "Emplacement", label: "Chemin", name: LOCATION_LABEL_VARIABLES.path },
      ]
    : [{ group: "Asset", label: "Numéro", name: ASSET_NUMBER_VARIABLE }];

/**
 * The values of a kind's own variables for a preview or a test: "number", the
 * number shown — a location's code is "E" and it.
 */
const sampleValues = (kind: LabelTemplateKind, number: string): Record<string, string> =>
  kind === "location"
    ? {
        "location.code": `E${number}`,
        "location.name": SAMPLE_PLACE.name,
        "location.type": SAMPLE_PLACE.type,
        "location.path": SAMPLE_PLACE.path,
      }
    : { "asset.number": number };

const read = selection<{ templates: string }>(
  "SELECT templates FROM board_label_templates WHERE board_id = ? AND list_key = ? AND kind = ?",
);
const write = mutation(
  `INSERT INTO board_label_templates (board_id, list_key, kind, templates) VALUES (?, ?, ?, ?)
   ON CONFLICT (board_id, list_key, kind) DO UPDATE SET templates = excluded.templates`,
);
const formatExists = selection<{ id: Id }>("SELECT id FROM paper_formats WHERE id = ?");
const printerOfFormat = selection<PrinterRow & { format: string }>(
  `SELECT p.*, f.name AS format FROM paper_formats f
   LEFT JOIN printers p ON p.id = f.printer_id WHERE f.id = ?`,
);

/** The widget's label groups, in their order, with their labels in theirs. */
export const groupsOf = (kind: LabelTemplateKind, scope: ListScope) => {
  // The table names come from the kind, checked against the list, never from
  // the request as is.
  const groups = selection<{ id: Id; name: string }>(
    `SELECT id, name FROM ${kind}_label_groups WHERE board_id = ? AND list_key = ?
     ORDER BY position, id`,
  ).all(scope.board, scope.list);
  const labels = selection<{ group_id: Id; name: string }>(
    `SELECT group_id, name FROM ${kind}_labels WHERE board_id = ? AND list_key = ?
     ORDER BY position, id`,
  ).all(scope.board, scope.list);
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

export const templatesOf = (kind: LabelTemplateKind, scope: ListScope): LabelTemplates => ({
  // A deleted paper format leaves its templates without one.
  templates: parsed(read.get(scope.board, scope.list, kind)?.templates).map((t) => ({
    ...t,
    paper_format_id:
      t.paper_format_id !== null && formatExists.get(t.paper_format_id) ? t.paper_format_id : null,
  })),
  variables: [
    ...ownVariables(kind),
    ...groupsOf(kind, scope).map((g) => ({
      group: "Étiquettes",
      label: g.name,
      name: labelGroupVariable(g.name),
    })),
  ],
});

/** An asset: its widget, its number, and the names of its labels with their groups'. */
interface PrintedAsset {
  board_id: Id | null;
  list_key: string;
  name: string;
  labels: { name: string; group_name: string | null }[];
}

/**
 * The asset of a kind. A supervised device carries the label named as its
 * tag, case aside; a declared asset, those linked to it.
 */
const assetOf = (kind: LabelTemplateKind, id: unknown): PrintedAsset | undefined => {
  // A location prints a place's label (routes/locations.ts).
  if (kind === "location") return undefined;
  if (kind === "managed_device_asset") {
    const row = selection<{ board_id: Id | null; list_key: string; name: string; tag: string }>(
      "SELECT board_id, list_key, name, tag FROM managed_device_assets WHERE id = ?",
    ).get(id);
    if (!row) return undefined;
    const labels = row.tag.trim()
      ? selection<{ name: string; group_name: string | null }>(
          `SELECT l.name, g.name AS group_name FROM managed_device_asset_labels l
           LEFT JOIN managed_device_asset_label_groups g ON g.id = l.group_id
           WHERE l.board_id = ? AND l.list_key = ? AND lower(trim(l.name)) = lower(trim(?))
           ORDER BY l.position, l.id`,
        ).all(row.board_id, row.list_key, row.tag)
      : [];
    return { board_id: row.board_id, list_key: row.list_key, name: row.name, labels };
  }
  const t = declaredAssetTables(kind);
  const row = selection<{ board_id: Id; list_key: string; name: string }>(
    `SELECT board_id, list_key, name FROM ${t.assets} WHERE id = ?`,
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
 * The widget named by "?board=&list=", if this person sees its board — and,
 * to change its templates, may modify the kind's widgets.
 */
export const verifyList = (req: Request, kind: LabelTemplateKind, write: boolean): ListScope => {
  if (write && !accessIncludes(widgetRights(req.user)[rightsKind(kind)], "update")) {
    throw new HttpError(403, "Vous n'avez pas le droit de modifier ici");
  }
  const board = openBoard(req.query.board, req.user);
  if (write) requireBoardControl(board, req.user);
  return listInBoard(board.id, `${kind}.list`, req.query.list);
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
  if (list.length > TEMPLATES_MAX) badRequest(`Un widget tient en ${TEMPLATES_MAX} modèles`);
  return list;
};

/** The printer of a paper format: required to preview or print. */
export const printerFor = (formatId: unknown): Printer => {
  if (formatId == null) badRequest("Choisissez d'abord le format d'étiquette du modèle");
  const row = printerOfFormat.get(Number(formatId)) ?? badRequest("Format d'étiquette introuvable");
  if (row.id == null) badRequest(`Le format « ${row.format} » n'a pas d'imprimante`);
  return toPrinter({ ...row, id: row.id });
};

/**
 * A text in a ZPL field: "^" and "~" would start a command — they are
 * dropped.
 */
export const zplText = (text: string): string => text.replace(/[\^~]/g, "");

/**
 * The template filled: the kind's own variables — "asset.number",
 * "location.code"… —, and each group's label — the one `pick` chooses among
 * its labels; none, empty.
 */
export const filled = (
  zpl: string,
  own: Record<string, string>,
  groups: { name: string; labels: string[] }[],
  pick: (labels: string[]) => string | undefined,
): string => {
  const byName = new Map(groups.map((g) => [g.name.toLowerCase(), g.labels]));
  return zpl
    .replace(/\{\{\s*((?:asset|location)\.[a-z]+)\s*\}\}/g, (match, name: string) =>
      name in own ? zplText(own[name] ?? "") : match,
    )
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

export const randomOf = (labels: string[]): string | undefined =>
  labels[Math.floor(Math.random() * labels.length)];

/** Several labels of a group, one after the other. */
export const joined = (labels: string[]): string | undefined => labels.join(", ") || undefined;

export const labelTemplateRoutes = Router();

labelTemplateRoutes.get("/:kind", (req, res) => {
  const kind = kindOf(req);
  res.json(templatesOf(kind, verifyList(req, kind, false)));
});

/** The list is replaced entirely. */
labelTemplateRoutes.put("/:kind", (req, res) => {
  const kind = kindOf(req);
  const scope = verifyList(req, kind, true);
  write.run(scope.board, scope.list, kind, JSON.stringify(readTemplates(req.body?.templates)));
  res.json(templatesOf(kind, scope));
});

/**
 * The label as the printer draws it, filled with a sample: the first label of
 * each group. Nothing is printed.
 */
labelTemplateRoutes.post("/:kind/preview", (req, res, next) => {
  const kind = kindOf(req);
  const scope = verifyList(req, kind, false);
  const { zpl, printer } = job(req);
  const groups = groupsOf(kind, scope);
  renderZpl(printer, filled(zpl, sampleValues(kind, SAMPLE_NUMBER), groups, (labels) => labels[0]))
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
  const scope = verifyList(req, kind, false);
  const { zpl, printer } = job(req);
  const number = String(1 + Math.floor(Math.random() * TEST_NUMBER_MAX));
  printZpl(printer, filled(zpl, sampleValues(kind, number), groupsOf(kind, scope), randomOf))
    .then(() => {
      const sent: LabelTestPrint = { printer: printer.name };
      res.json(sent);
    })
    .catch(next);
});

/**
 * An asset's label: the template of this name, among those of the asset's
 * widget, filled with its number and, for each group, its labels in it.
 */
labelTemplateRoutes.post("/:kind/assets/:id/print", (req, res, next) => {
  const kind = kindOf(req);
  const missing = "Asset introuvable";
  if (!accessIncludes(widgetRights(req.user)[rightsKind(kind)], "view")) fail(404, missing);
  const asset = assetOf(kind, req.params.id) ?? fail(404, missing);
  if (asset.board_id === null) fail(404, missing);
  const scope = { board: openBoard(asset.board_id, req.user).id, list: asset.list_key };
  const number = zplText(asset.name.trim());
  if (!number) badRequest("L'asset n'a pas de numéro");
  const name = String(req.body?.name ?? "");
  const template =
    templatesOf(kind, scope).templates.find((t) => t.name === name) ??
    fail(404, `Le modèle « ${name} » n'existe plus`);
  if (!template.zpl.trim()) badRequest(`Le modèle « ${name} » est vide`);
  const printer = printerFor(template.paper_format_id);
  const groups = groupsOf(kind, scope).map((g) => ({
    name: g.name,
    labels: asset.labels.filter((l) => l.group_name === g.name).map((l) => l.name),
  }));
  printZpl(printer, filled(template.zpl, { "asset.number": number }, groups, joined))
    .then(() => {
      const sent: LabelTestPrint = { printer: printer.name };
      res.json(sent);
    })
    .catch(next);
});
