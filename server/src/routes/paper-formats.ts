// The paper formats of "Paramétrage" > "Impression": a label's size and the
// printer it goes in. Read by everyone, written from the Settings (app.ts).

import { Router } from "express";
import type { PaperFormat } from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import type { PaperFormatRow } from "../db/rows.js";
import { badRequest, conflict, orNotFound, requireText } from "../lib/http.js";

const FORMAT_NOT_FOUND = "Format de papier introuvable";
const FORMAT_EXISTS = "Ce format de papier existe déjà";

/** The largest label side accepted, in millimeters. */
const MAX_SIZE = 2000;

const all = selection<PaperFormatRow>("SELECT * FROM paper_formats ORDER BY name");
const byId = selection<PaperFormatRow>("SELECT * FROM paper_formats WHERE id = ?");
const byName = selection<PaperFormatRow>(
  "SELECT * FROM paper_formats WHERE name = ? COLLATE NOCASE AND id != ?",
);
const printerExists = selection<{ id: number }>("SELECT id FROM printers WHERE id = ?");
const create = mutation(
  "INSERT INTO paper_formats (name, printer_id, width, height) VALUES (?, ?, ?, ?)",
);
const update = mutation(
  "UPDATE paper_formats SET name = ?, printer_id = ?, width = ?, height = ? WHERE id = ?",
);
const remove = mutation("DELETE FROM paper_formats WHERE id = ?");

const toFormat = (row: PaperFormatRow): PaperFormat => ({
  id: row.id,
  name: row.name,
  printer_id: row.printer_id,
  width: row.width,
  height: row.height,
});

/** A size in millimeters, to the hundredth: required, a format is never left without. */
const validSize = (value: unknown, what: string): number => {
  if (value === null || value === undefined || value === "") badRequest(`La ${what} est requise`);
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_SIZE) {
    badRequest(`Les dimensions vont de 0 à ${MAX_SIZE} mm`);
  }
  return Math.round(size * 100) / 100;
};

const validPrinter = (value: unknown): number | null => {
  if (value === null) return null;
  return printerExists.get(value)?.id ?? badRequest("Imprimante introuvable");
};

export const paperFormatRoutes = Router();

paperFormatRoutes.get("/", (_req, res) => {
  res.json(all.all().map(toFormat));
});

// Created complete: its name, its width and its height at once.
paperFormatRoutes.post("/", (req, res) => {
  const body = req.body ?? {};
  const name = requireText(body.name, "Le nom est requis");
  if (byName.get(name, 0)) conflict(FORMAT_EXISTS);
  const { lastInsertRowid } = create.run(
    name,
    body.printer_id === undefined ? null : validPrinter(body.printer_id),
    validSize(body.width, "largeur"),
    validSize(body.height, "hauteur"),
  );
  res.status(201).json(toFormat(byId.get(lastInsertRowid)!));
});

// What is not sent stays as it was.
paperFormatRoutes.put("/:id", (req, res) => {
  const existing = orNotFound(byId.get(req.params.id), FORMAT_NOT_FOUND);
  const body = req.body ?? {};
  const name = body.name === undefined ? existing.name : requireText(body.name, "Le nom est requis");
  if (byName.get(name, existing.id)) conflict(FORMAT_EXISTS);
  update.run(
    name,
    body.printer_id === undefined ? existing.printer_id : validPrinter(body.printer_id),
    body.width === undefined ? existing.width : validSize(body.width, "largeur"),
    body.height === undefined ? existing.height : validSize(body.height, "hauteur"),
    existing.id,
  );
  res.json(toFormat(byId.get(existing.id)!));
});

paperFormatRoutes.delete("/:id", (req, res) => {
  const existing = orNotFound(byId.get(req.params.id), FORMAT_NOT_FOUND);
  remove.run(existing.id);
  res.status(204).end();
});
