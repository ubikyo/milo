// The printers of "Paramétrage" > "Impression". Set from the Settings — adding,
// editing, deleting them require its "Modifier" right —,
// read by everyone: whoever prints a label picks one of them. Their paper
// formats are routes/paper-formats.ts.

import { Router } from "express";
import net from "node:net";
import { PRINTER_TYPES } from "@milo/shared";
import type { Printer, PrinterInfos, PrinterType } from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import type { PrinterRow } from "../db/rows.js";
import { badRequest, conflict, orNotFound, requireText } from "../lib/http.js";
import { MAX_ZPL_LENGTH, printZpl, printerInfo } from "../lib/zebra.js";
import { requireSettings } from "../middleware/require-auth.js";

const PRINTER_NOT_FOUND = "Imprimante introuvable";
const PRINTER_EXISTS = "Cette imprimante existe déjà";

const all = selection<PrinterRow>("SELECT * FROM printers ORDER BY name");
const byId = selection<PrinterRow>("SELECT * FROM printers WHERE id = ?");
const byName = selection<PrinterRow>(
  "SELECT * FROM printers WHERE name = ? COLLATE NOCASE AND id != ?",
);
const create = mutation("INSERT INTO printers (type, name, host) VALUES (?, ?, ?)");
const update = mutation("UPDATE printers SET type = ?, name = ?, host = ? WHERE id = ?");
const remove = mutation("DELETE FROM printers WHERE id = ?");

const toPrinter = (row: PrinterRow): Printer => ({
  id: row.id,
  type: (PRINTER_TYPES as readonly string[]).includes(row.type) ? (row.type as PrinterType) : "zebra",
  name: row.name,
  host: row.host,
});

/** A host name: letters, digits, dashes, separated by dots. */
const HOST_NAME = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;

const validType = (value: unknown): PrinterType =>
  (PRINTER_TYPES as readonly unknown[]).includes(value)
    ? (value as PrinterType)
    : badRequest("Type d'imprimante inconnu");

/** An IP address — or a host name: required, a printer is never left without. */
const validHost = (value: unknown): string => {
  const host = requireText(value, "L'adresse IP est requise");
  if (!net.isIP(host) && !HOST_NAME.test(host)) badRequest("Adresse IP invalide");
  return host;
};

export const printerRoutes = Router();

printerRoutes.get("/", (_req, res) => {
  res.json(all.all().map(toPrinter));
});

// Each printer asked at once: the slowest sets the wait, a few seconds at
// most (lib/zebra.ts).
printerRoutes.get("/info", (_req, res, next) => {
  const printers = all.all().map(toPrinter);
  Promise.all(printers.map(printerInfo))
    .then((answers) => {
      const infos: PrinterInfos = {};
      printers.forEach((p, i) => (infos[p.id] = answers[i]!));
      res.json(infos);
    })
    .catch(next);
});

// Created complete: its name and its IP address at once.
printerRoutes.post("/", requireSettings, (req, res) => {
  const name = requireText(req.body.name, "Le nom est requis");
  if (byName.get(name, 0)) conflict(PRINTER_EXISTS);
  const type = req.body.type === undefined ? "zebra" : validType(req.body.type);
  const host = validHost(req.body.host);
  const { lastInsertRowid } = create.run(type, name, host);
  res.status(201).json(toPrinter(byId.get(lastInsertRowid)!));
});

// What is not sent stays as it was.
printerRoutes.put("/:id", requireSettings, (req, res) => {
  const existing = orNotFound(byId.get(req.params.id), PRINTER_NOT_FOUND);
  const body = req.body ?? {};
  const name = body.name === undefined ? existing.name : requireText(body.name, "Le nom est requis");
  if (byName.get(name, existing.id)) conflict(PRINTER_EXISTS);
  update.run(
    body.type === undefined ? existing.type : validType(body.type),
    name,
    body.host === undefined ? existing.host : validHost(body.host),
    existing.id,
  );
  res.json(toPrinter(byId.get(existing.id)!));
});

printerRoutes.delete("/:id", requireSettings, (req, res) => {
  const existing = orNotFound(byId.get(req.params.id), PRINTER_NOT_FOUND);
  remove.run(existing.id);
  res.status(204).end();
});

/** A ZPL job, sent as is: whoever is signed in can print. */
printerRoutes.post("/:id/print", (req, res, next) => {
  const printer = toPrinter(orNotFound(byId.get(req.params.id), PRINTER_NOT_FOUND));
  const zpl = typeof req.body?.zpl === "string" ? req.body.zpl : "";
  if (!zpl.trim()) badRequest("Rien à imprimer");
  if (zpl.length > MAX_ZPL_LENGTH) badRequest("Travail d'impression trop volumineux");
  printZpl(printer, zpl)
    .then(() => res.status(204).end())
    .catch(next);
});
