// Files: a card's attachments, images pasted into a description, and reading
// both.
//
// The request body is the file itself, raw, not a multipart form: the name
// and type travel as URL parameters. That is all we need — one upload, one
// file — and it saves one more dependency for parsing multipart.

import { ticketPathFor, quotedFile } from "../lib/ticket-files.js";
import express, { Router } from "express";
import type { Request } from "express";
import { HttpError, badRequest, orNotFound, toIds } from "../lib/http.js";
import {
  SIZE_MAX,
  mediaPath,
  writeMedia,
  inlineType,
  mediaUrl,
  resizedMedia,
} from "../lib/media.js";
import { concerned, notify, notifyDeletion, root } from "../lib/notify.js";
import { now } from "../lib/time.js";
import {
  attachmentOf,
  attachments,
  attachmentsOf,
  removeAttachment,
  reorderAttachments,
} from "../repositories/attachments.js";
import { coverOf, covers, coversOf, removeCover, reorderCovers } from "../repositories/covers.js";
import { touch } from "../middleware/events.js";
import { openTaskBoard } from "../repositories/boards.js";
import { boardOfCard, taskCards } from "../repositories/tasks.js";

const CARD_NOT_FOUND = "Carte introuvable";
const ATTACHMENT_NOT_FOUND = "Pièce jointe introuvable";
const FILE_NOT_FOUND = "Fichier introuvable";

/** The body is a file: we take it as is, whatever its declared type. */
const fileBody = express.raw({ type: () => true, limit: SIZE_MAX });

/**
 * The targeted card, if its board is open to this person and they can edit
 * the tasks of its company: everything that goes through here writes to the
 * card.
 */
const openCard = (id: unknown, req: Request) => {
  const card = orNotFound(taskCards.byId.get(id), CARD_NOT_FOUND);
  openTaskBoard(boardOfCard(card), req, "update");
  return card;
};

/** A received file name, reduced to a label: never to a path. */
const receivedName = (value: unknown): string => {
  const name = String(value ?? "")
    .split(/[/\\]/)
    .pop()!
    .trim()
    .slice(0, 255);
  return name || "fichier";
};

/**
 * The type declared by the client. It is only kept for the record: what the
 * server returns is deduced from the extension (lib/media.ts), never from this.
 */
const receivedType = (value: unknown): string => {
  const mime = String(value ?? "").trim().slice(0, 100);
  return /^[\w.+-]+\/[\w.+-]+$/.test(mime) ? mime : "application/octet-stream";
};

/** The uploaded file: its content, name, type. */
const receivedFile = (req: Request) => {
  const content: unknown = req.body;
  if (!Buffer.isBuffer(content) || content.length === 0) badRequest("Fichier vide");

  return {
    content: content as Buffer,
    name: receivedName(req.query["name"]),
    mime: receivedType(req.query["type"]),
  };
};

/**
 * Mounted under `/api/task-cards/:id`: what gets uploaded onto a card.
 *
 * Nothing in it touches the event counters: the board shows neither the
 * attachments nor a description's images, and making every connected client
 * re-read its lists for an uploaded file would tell them nothing.
 */
export const cardMediaRoutes = Router({ mergeParams: true });

cardMediaRoutes.post("/attachments", fileBody, (req, res) => {
  const { id } = req.params as { id?: string };
  const card = openCard(id, req);
  const { content, name, mime } = receivedFile(req);

  const file = writeMedia(content, name);
  const { lastInsertRowid } = attachments.create.run(
    card.id,
    file,
    name,
    mime,
    content.length,
    req.user.id,
    now(),
    card.id,
  );

  notify({
    kind: "card",
    targetId: card.id,
    title: card.text,
    message: `a joint « ${name} »`,
    author: req.user,
    base: root(req),
  });
  res.status(201).json(attachmentOf(attachments.byId.get(lastInsertRowid)!));
});

/** Something changed on the card's media: those who follow it are told. */
const mediaChanged = (req: Request, card: { id: number; text: string }, message: string): void =>
  notify({ kind: "card", targetId: card.id, title: card.text, message, author: req.user, base: root(req) });

// An image pasted into a description. It leaves no row in the database: the
// description cites it, and the media cleanup relies on that citation to know
// the file is still in use.
cardMediaRoutes.post("/images", fileBody, (req, res) => {
  const { id } = req.params as { id?: string };
  openCard(id, req);
  const { content, name } = receivedFile(req);

  // An image the server would not return as is has no business in a
  // description: it would show up as an empty frame. Filtering happens
  // before writing, so as not to leave a file that nothing will cite.
  if (!(inlineType(name) ?? "").startsWith("image/")) {
    badRequest("Ce format d'image ne peut pas être collé dans une description");
  }

  res.status(201).json({ url: mediaUrl(writeMedia(content, name)) });
});

// A cover image. Only images the server returns as is get through: a cover
// is displayed, not downloaded. The card shows it on the board: the lists
// are re-read.
cardMediaRoutes.post("/covers", touch("task-lists"), fileBody, (req, res) => {
  const { id } = req.params as { id?: string };
  const card = openCard(id, req);
  const { content, name } = receivedFile(req);
  if (!(inlineType(name) ?? "").startsWith("image/")) {
    badRequest("Ce format d'image ne peut pas servir de couverture");
  }

  const { lastInsertRowid } = covers.create.run(
    card.id,
    writeMedia(content, name),
    name,
    content.length,
    covers.nextPosition(card.id).next,
    now(),
  );
  mediaChanged(req, card, `a ajouté l'image de couverture « ${name} »`);
  res.status(201).json(coverOf(covers.byId.get(lastInsertRowid)!));
});

// The attachments' order, as the detail view shows it.
cardMediaRoutes.put("/attachments/order", (req, res) => {
  const { id } = req.params as { id?: string };
  const card = openCard(id, req);
  reorderAttachments(card.id, toIds(req.body.ids));
  mediaChanged(req, card, "a réorganisé les pièces jointes");
  res.json(attachmentsOf(card.id));
});

// The covers' order: the first one is the board's.
cardMediaRoutes.put("/covers/order", touch("task-lists"), (req, res) => {
  const { id } = req.params as { id?: string };
  const card = openCard(id, req);
  reorderCovers(card.id, toIds(req.body.ids));
  mediaChanged(req, card, "a réorganisé les images de couverture");
  res.json(coversOf(card.id));
});

/** Mounted under `/api/covers`. */
export const coverRoutes = Router();

coverRoutes.delete("/:id", touch("task-lists"), (req, res) => {
  const cover = orNotFound(covers.byId.get(req.params.id), "Image de couverture introuvable");
  const card = openCard(cover.card_id, req);
  removeCover(cover);
  notifyDeletion({
    kind: "card",
    targetId: card.id,
    title: card.text,
    message: `a supprimé l'image de couverture « ${cover.name} »`,
    author: req.user,
    base: root(req),
    recipients: concerned.card(card.id),
    vanished: false,
  });
  res.status(204).end();
});

/** Mounted under `/api/attachments`. */
export const attachmentRoutes = Router();

attachmentRoutes.delete("/:id", (req, res) => {
  const attachment = orNotFound(attachments.byId.get(req.params.id), ATTACHMENT_NOT_FOUND);
  const card = openCard(attachment.card_id, req);

  removeAttachment(attachment);
  notifyDeletion({
    kind: "card",
    targetId: card.id,
    title: card.text,
    message: `a supprimé la pièce jointe « ${attachment.name} »`,
    author: req.user,
    base: root(req),
    recipients: concerned.card(card.id),
    vanished: false,
  });
  res.status(204).end();
});

/**
 * Mounted under `/api/media` (and the old `/api/medias`), and — the only
 * route in this case — before the session requirement: a browser fetching a
 * description's image with an "img" tag puts no authentication header on it.
 * What stands in for a key is the file name: sixteen random bytes, which
 * cannot be guessed or listed.
 */
export const mediaRoutes = Router();

mediaRoutes.get("/:file", (req, res, next) => {
  const file = String(req.params["file"] ?? "");
  const original = orNotFound(mediaPath(file), FILE_NOT_FOUND);

  // "?w=": the image reduced to the width where it is shown (an Image
  // widget's section), rather than its original. The original stays on disk,
  // untouched; failing a copy, it is the one that goes out.
  const width = Number(req.query["w"]);
  if (Number.isInteger(width) && width > 0) {
    resizedMedia(file, width)
      .then((variant) => send(res, next, file, variant ?? original, variant ? "image/webp" : null))
      .catch(next);
    return;
  }
  send(res, next, file, original, null);
});

/** Returns a media file — or its reduced copy, of the given type. */
const send = (
  res: express.Response,
  next: express.NextFunction,
  file: string,
  path: string,
  copyType: string | null,
) => {
  const type = copyType ?? inlineType(file);

  // The original name, for an attachment: it is the one it should be saved
  // under, not the sixteen random bytes. An image pasted into a description
  // has no row in the database and so keeps its own, which is not visible:
  // we don't save it.
  const name = attachments.byFile.get({ file })?.name ?? file;

  // Whatever is not on the list of types returned as is goes out as a
  // download, with no guessed type: a file uploaded onto a card must never
  // run on our own origin.
  res.type(type ?? "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Disposition",
    `${type ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
  );
  // The name is never reused: what sits behind an address does not change,
  // the browser can keep it.
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");

  // The file has vanished from disk while its row remained: the error goes
  // through "next", sendFile's callback being outside Express's stack.
  res.sendFile(path, (error) => {
    if (error && !res.headersSent) next(new HttpError(404, FILE_NOT_FOUND));
  });
};

/**
 * Mounted under `/api/ticket-files`, like media before the session
 * requirement: the images of a received e-mail are shown in a frame that
 * carries no authentication header. Same key: a name of sixteen random bytes
 * (lib/ticket-files.ts).
 */
export const ticketFileRoutes = Router();

ticketFileRoutes.get("/:file", (req, res, next) => {
  const file = String(req.params["file"] ?? "");
  const path = orNotFound(ticketPathFor(file), FILE_NOT_FOUND);
  const type = inlineType(file);
  const name = quotedFile(file)?.name ?? file;

  res.type(type ?? "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Disposition",
    `${type ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
  );
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  res.sendFile(path, (error) => {
    if (error && !res.headersSent) next(new HttpError(404, FILE_NOT_FOUND));
  });
});
