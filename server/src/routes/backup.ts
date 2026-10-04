// La sauvegarde : le téléchargement de l'archive, et sa restauration.
//
// Comme pour les pièces jointes, le corps d'une restauration est le fichier
// lui-même, brut : le serveur n'attend qu'une archive, il la lit telle quelle.

import express, { Router } from "express";
import { RESOURCES, backupFileName } from "@milo/shared";
import { badRequest } from "../lib/http.js";
import { buildBackup, backupInfo, restoreFromBackup } from "../lib/backup.js";
import { touchNow } from "../middleware/events.js";

/**
 * Une archive tient la base et tous les fichiers déposés : elle n'a rien de
 * commun avec les 25 Mo d'une pièce jointe. La limite reste là pour qu'un
 * corps démesuré soit refusé avant d'être gardé en mémoire.
 */
const SIZE_MAX = 512 * 1024 * 1024;

const archiveBody = express.raw({ type: () => true, limit: SIZE_MAX });

export const backupRoutes = Router();

backupRoutes.get("/", (_req, res) => {
  res.json(backupInfo());
});

backupRoutes.get("/archive", (_req, res) => {
  const archive = buildBackup();

  res.type("application/gzip");
  res.setHeader("Content-Disposition", `attachment; filename="${backupFileName()}"`);
  // Une sauvegarde est datée de l'instant où elle est demandée : rien ne doit
  // en servir une plus ancienne.
  res.setHeader("Cache-Control", "no-store");
  res.send(archive);
});

backupRoutes.post("/restore", archiveBody, (req, res) => {
  const content: unknown = req.body;
  if (!Buffer.isBuffer(content) || content.length === 0) badRequest("Archive vide");

  const result = restoreFromBackup(content as Buffer);

  // Tout a changé, jusqu'aux sessions : les clients connectés relisent tout.
  touchNow(res, ...RESOURCES);
  res.json(result);
});
