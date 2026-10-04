// Les fichiers : les pièces jointes d'une carte, les images collées dans une
// description, et la lecture des uns comme des autres.
//
// Le corps de la requête est le fichier lui-même, brut, et non un formulaire
// en plusieurs parties : le nom et le type voyagent en paramètres d'adresse.
// C'est tout ce dont on a besoin — un dépôt, un fichier — et cela évite une
// dépendance de plus pour analyser du multipart.

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
} from "../lib/medias.js";
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

/** Le corps est un fichier : on le prend tel quel, quel que soit son type annoncé. */
const fileBody = express.raw({ type: () => true, limit: SIZE_MAX });

/**
 * La carte visée, si son tableau est ouvert à cette personne et qu'elle peut
 * modifier les tâches de sa société : tout ce qui passe par ici écrit sur la
 * carte.
 */
const openCard = (id: unknown, req: Request) => {
  const card = orNotFound(taskCards.byId.get(id), CARD_NOT_FOUND);
  openTaskBoard(boardOfCard(card), req, "update");
  return card;
};

/** Un nom de fichier reçu, ramené à un intitulé : jamais à un chemin. */
const receivedName = (value: unknown): string => {
  const name = String(value ?? "")
    .split(/[/\\]/)
    .pop()!
    .trim()
    .slice(0, 255);
  return name || "fichier";
};

/**
 * Le type annoncé par le client. Il n'est gardé que pour mémoire : ce que le
 * serveur rend est déduit de l'extension (lib/medias.ts), jamais de ceci.
 */
const receivedType = (value: unknown): string => {
  const mime = String(value ?? "").trim().slice(0, 100);
  return /^[\w.+-]+\/[\w.+-]+$/.test(mime) ? mime : "application/octet-stream";
};

/** Le fichier déposé : son contenu, son nom, son type. */
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
 * Monté sous `/api/task-cards/:id` : ce qui se dépose sur une carte.
 *
 * Rien n'y touche les compteurs d'événements : le tableau ne montre ni les
 * pièces jointes ni les images d'une description, et faire relire ses listes à
 * tous les clients connectés pour un fichier déposé ne leur apprendrait rien.
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

// Une image collée dans une description. Elle ne laisse pas de ligne en base :
// c'est la description qui la cite, et le ménage des médias s'appuie sur cette
// citation pour savoir que le fichier sert encore.
cardMediaRoutes.post("/images", fileBody, (req, res) => {
  const { id } = req.params as { id?: string };
  openCard(id, req);
  const { content, name } = receivedFile(req);

  // Une image que le serveur ne rendrait pas telle quelle n'a rien à faire
  // dans une description : elle s'y afficherait comme un cadre vide. Le tri se
  // fait avant d'écrire, pour ne pas laisser un fichier que rien ne citera.
  if (!(inlineType(name) ?? "").startsWith("image/")) {
    badRequest("Ce format d'image ne peut pas être collé dans une description");
  }

  res.status(201).json({ url: mediaUrl(writeMedia(content, name)) });
});

// Une image de couverture. Seules les images que le serveur rend telles
// quelles passent : une couverture se montre, elle ne se télécharge pas. La
// carte la montre sur le tableau : les listes se relisent.
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
  res.status(201).json(coverOf(covers.byId.get(lastInsertRowid)!));
});

// L'ordre des pièces jointes, tel que la fiche le montre.
cardMediaRoutes.put("/attachments/order", (req, res) => {
  const { id } = req.params as { id?: string };
  const card = openCard(id, req);
  reorderAttachments(card.id, toIds(req.body.ids));
  res.json(attachmentsOf(card.id));
});

// L'ordre des couvertures : la première est celle du tableau.
cardMediaRoutes.put("/covers/order", touch("task-lists"), (req, res) => {
  const { id } = req.params as { id?: string };
  const card = openCard(id, req);
  reorderCovers(card.id, toIds(req.body.ids));
  res.json(coversOf(card.id));
});

/** Monté sous `/api/covers`. */
export const coverRoutes = Router();

coverRoutes.delete("/:id", touch("task-lists"), (req, res) => {
  const cover = orNotFound(covers.byId.get(req.params.id), "Image de couverture introuvable");
  openCard(cover.card_id, req);
  removeCover(cover);
  res.status(204).end();
});

/** Monté sous `/api/attachments`. */
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
    recipients: concerned.card(card.id),
    vanished: false,
  });
  res.status(204).end();
});

/**
 * Monté sous `/api/medias`, et — seule route dans ce cas — avant l'exigence
 * d'une session : un navigateur qui va chercher l'image d'une description avec
 * une balise « img » n'y met pas d'en-tête d'authentification. Ce qui tient
 * lieu de clé, c'est le nom du fichier : seize octets tirés au sort, qui ne se
 * devinent pas et ne se listent pas.
 */
export const mediaRoutes = Router();

mediaRoutes.get("/:file", (req, res, next) => {
  const file = String(req.params["file"] ?? "");
  const path = orNotFound(mediaPath(file), FILE_NOT_FOUND);
  const type = inlineType(file);

  // Le nom d'origine, s'il s'agit d'une pièce jointe : c'est sous celui-là
  // qu'on veut l'enregistrer, pas sous les seize octets tirés au sort. Une
  // image collée dans une description n'a pas de ligne en base et garde donc
  // le sien, ce qui ne se voit pas : on ne l'enregistre pas.
  const name = attachments.byFile.get(file)?.name ?? file;

  // Ce qui n'est pas de la liste des types rendus tels quels s'en va en
  // téléchargement, sans type deviné : un fichier déposé sur une carte ne doit
  // jamais s'exécuter sur notre propre origine.
  res.type(type ?? "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Disposition",
    `${type ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
  );
  // Le nom ne se réemploie jamais : ce qui est derrière une adresse ne change
  // pas, le navigateur peut le garder.
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");

  // Le fichier a disparu du disque alors que sa ligne est restée : l'erreur
  // passe par « next », le rappel de sendFile étant hors de la pile d'Express.
  res.sendFile(path, (error) => {
    if (error && !res.headersSent) next(new HttpError(404, FILE_NOT_FOUND));
  });
});

/**
 * Monté sous `/api/ticket-files`, comme les médias avant l'exigence d'une
 * session : les images d'un e-mail reçu s'affichent dans un cadre qui ne porte
 * pas d'en-tête d'authentification. Même clé : un nom de seize octets tirés au
 * sort (lib/ticket-files.ts).
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
