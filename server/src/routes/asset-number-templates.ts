// The asset number templates of a declared asset widget (shared,
// asset-number-templates.ts): a name, and TypeScript that draws a new asset's
// number. They are the widget's own, as its label templates; like
// those, they follow the permission on the widget type. The server only keeps
// them: the browser runs them, in a worker (client, lib/assetNumber.ts).
//
// Their variables are the kind's label groups — "{{label.Société}}" —, each
// with its labels, from which a test draws.

import { Router } from "express";
import type { Request } from "express";
import {
  ASSET_NUMBER_CODE_MAX,
  ASSET_NUMBER_TEMPLATE_NAME_MAX,
  isDeclaredAssetKind,
  labelGroupVariable,
} from "@milo/shared";
import type { AssetNumberTemplate, AssetNumberTemplates, DeclaredAssetKind } from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import { badRequest, fail } from "../lib/http.js";
import type { ListScope } from "../repositories/lists.js";
import { groupsOf, verifyList } from "./label-templates.js";

/** A widget holds this many templates at most. */
const TEMPLATES_MAX = 100;

const read = selection<{ templates: string }>(
  "SELECT templates FROM board_asset_number_templates WHERE board_id = ? AND list_key = ? AND kind = ?",
);
const write = mutation(
  `INSERT INTO board_asset_number_templates (board_id, list_key, kind, templates) VALUES (?, ?, ?, ?)
   ON CONFLICT (board_id, list_key, kind) DO UPDATE SET templates = excluded.templates`,
);

const parsed = (saved: string | undefined): AssetNumberTemplate[] => {
  if (!saved) return [];
  try {
    const list = JSON.parse(saved) as unknown;
    return Array.isArray(list) ? (list as AssetNumberTemplate[]) : [];
  } catch {
    return [];
  }
};

const templatesOf = (kind: DeclaredAssetKind, scope: ListScope): AssetNumberTemplates => ({
  templates: parsed(read.get(scope.board, scope.list, kind)?.templates),
  variables: groupsOf(kind, scope).map((g) => ({
    group: "Étiquettes",
    label: g.name,
    name: labelGroupVariable(g.name),
    samples: g.labels,
  })),
});

/** The kind named by the path. */
const kindOf = (req: Request): DeclaredAssetKind =>
  isDeclaredAssetKind(req.params.kind) ? req.params.kind : fail(404, "Type d'asset inconnu");

/** The list, as sent: empty rows left out, a name only once, case aside. */
const readTemplates = (received: unknown): AssetNumberTemplate[] => {
  const entries = Array.isArray(received)
    ? (received as unknown[])
    : badRequest("Les formats de numéro d'asset sont une liste");
  const seen = new Set<string>();
  const list: AssetNumberTemplate[] = [];
  for (const entry of entries) {
    const row = (entry ?? {}) as Record<string, unknown>;
    const name = String(row.name ?? "").trim();
    if (!name) continue;
    if (name.length > ASSET_NUMBER_TEMPLATE_NAME_MAX) {
      badRequest(`Un nom tient en ${ASSET_NUMBER_TEMPLATE_NAME_MAX} caractères`);
    }
    const key = name.toLowerCase();
    if (seen.has(key)) badRequest(`« ${name} » figure deux fois`);
    seen.add(key);
    const code = typeof row.code === "string" ? row.code : "";
    if (code.length > ASSET_NUMBER_CODE_MAX) badRequest(`Le format « ${name} » est trop volumineux`);
    list.push({ name, code });
  }
  if (list.length > TEMPLATES_MAX) badRequest(`Un widget tient en ${TEMPLATES_MAX} formats`);
  return list;
};

export const assetNumberTemplateRoutes = Router();

assetNumberTemplateRoutes.get("/:kind", (req, res) => {
  const kind = kindOf(req);
  res.json(templatesOf(kind, verifyList(req, kind, false)));
});

/** The list is replaced entirely. */
assetNumberTemplateRoutes.put("/:kind", (req, res) => {
  const kind = kindOf(req);
  const scope = verifyList(req, kind, true);
  write.run(scope.board, scope.list, kind, JSON.stringify(readTemplates(req.body?.templates)));
  res.json(templatesOf(kind, scope));
});
