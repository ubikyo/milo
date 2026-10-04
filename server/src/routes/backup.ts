// Backup: downloading the archive, and restoring it.
//
// As for attachments, a restore's body is the file itself, raw: the server
// only expects an archive, and reads it as is.

import express, { Router } from "express";
import { RESOURCES, backupFileName } from "@milo/shared";
import { badRequest } from "../lib/http.js";
import { buildBackup, backupInfo, restoreFromBackup } from "../lib/backup.js";
import { touchNow } from "../middleware/events.js";

/**
 * An archive holds the database and all uploaded files: it has nothing in
 * common with the 25 MB of an attachment. The limit stays so that an
 * oversized body is rejected before being held in memory.
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
  // A backup is dated from the moment it is requested: nothing should serve
  // an older one.
  res.setHeader("Cache-Control", "no-store");
  res.send(archive);
});

backupRoutes.post("/restore", archiveBody, (req, res) => {
  const content: unknown = req.body;
  if (!Buffer.isBuffer(content) || content.length === 0) badRequest("Archive vide");

  const result = restoreFromBackup(content as Buffer);

  // Everything has changed, down to the sessions: connected clients re-read
  // everything.
  touchNow(res, ...RESOURCES);
  res.json(result);
});
