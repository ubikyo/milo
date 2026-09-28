// Les fichiers : les pièces jointes d'une carte, les images collées dans une
// description, et la lecture des uns comme des autres.
//
// Le corps de la requête est le fichier lui-même, brut, et non un formulaire
// en plusieurs parties : le nom et le type voyagent en paramètres d'adresse.
// C'est tout ce dont on a besoin — un dépôt, un fichier — et cela évite une
// dépendance de plus pour analyser du multipart.

import express, { Router } from "express";
import type { Request } from "express";
import { HttpError, badRequest, orNotFound } from "../lib/http.js";
import {
  TAILLE_MAX,
  cheminMedia,
  ecrireMedia,
  typeEnLigne,
  urlMedia,
} from "../lib/medias.js";
import { now } from "../lib/time.js";
import { attachmentOf, attachments, removeAttachment } from "../repositories/attachments.js";
import { boardOuvert } from "../repositories/boards.js";
import { boardOfCard, taskCards } from "../repositories/tasks.js";

const CARTE_INTROUVABLE = "Carte introuvable";
const PIECE_INTROUVABLE = "Pièce jointe introuvable";
const FICHIER_INTROUVABLE = "Fichier introuvable";

/** Le corps est un fichier : on le prend tel quel, quel que soit son type annoncé. */
const corpsFichier = express.raw({ type: () => true, limit: TAILLE_MAX });

const carteOuverte = (id: unknown, user: Express.Request["user"]) => {
  const card = orNotFound(taskCards.byId.get(id), CARTE_INTROUVABLE);
  boardOuvert(boardOfCard(card), user);
  return card;
};

/** Un nom de fichier reçu, ramené à un intitulé : jamais à un chemin. */
const nomRecu = (valeur: unknown): string => {
  const nom = String(valeur ?? "")
    .split(/[/\\]/)
    .pop()!
    .trim()
    .slice(0, 255);
  return nom || "fichier";
};

/**
 * Le type annoncé par le client. Il n'est gardé que pour mémoire : ce que le
 * serveur rend est déduit de l'extension (lib/medias.ts), jamais de ceci.
 */
const typeRecu = (valeur: unknown): string => {
  const mime = String(valeur ?? "").trim().slice(0, 100);
  return /^[\w.+-]+\/[\w.+-]+$/.test(mime) ? mime : "application/octet-stream";
};

/** Le fichier déposé : son contenu, son nom, son type. */
const fichierRecu = (req: Request) => {
  const contenu: unknown = req.body;
  if (!Buffer.isBuffer(contenu) || contenu.length === 0) badRequest("Fichier vide");

  return {
    contenu: contenu as Buffer,
    nom: nomRecu(req.query["name"]),
    mime: typeRecu(req.query["type"]),
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

cardMediaRoutes.post("/attachments", corpsFichier, (req, res) => {
  const { id } = req.params as { id?: string };
  const card = carteOuverte(id, req.user);
  const { contenu, nom, mime } = fichierRecu(req);

  const fichier = ecrireMedia(contenu, nom);
  const { lastInsertRowid } = attachments.create.run(
    card.id,
    fichier,
    nom,
    mime,
    contenu.length,
    req.user.id,
    now(),
  );

  res.status(201).json(attachmentOf(attachments.byId.get(lastInsertRowid)!));
});

// Une image collée dans une description. Elle ne laisse pas de ligne en base :
// c'est la description qui la cite, et le ménage des médias s'appuie sur cette
// citation pour savoir que le fichier sert encore.
cardMediaRoutes.post("/images", corpsFichier, (req, res) => {
  const { id } = req.params as { id?: string };
  carteOuverte(id, req.user);
  const { contenu, nom } = fichierRecu(req);

  // Une image que le serveur ne rendrait pas telle quelle n'a rien à faire
  // dans une description : elle s'y afficherait comme un cadre vide. Le tri se
  // fait avant d'écrire, pour ne pas laisser un fichier que rien ne citera.
  if (!(typeEnLigne(nom) ?? "").startsWith("image/")) {
    badRequest("Ce format d'image ne peut pas être collé dans une description");
  }

  res.status(201).json({ url: urlMedia(ecrireMedia(contenu, nom)) });
});

/** Monté sous `/api/attachments`. */
export const attachmentRoutes = Router();

attachmentRoutes.delete("/:id", (req, res) => {
  const piece = orNotFound(attachments.byId.get(req.params.id), PIECE_INTROUVABLE);
  carteOuverte(piece.card_id, req.user);

  removeAttachment(piece);
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
  const fichier = String(req.params["file"] ?? "");
  const chemin = orNotFound(cheminMedia(fichier), FICHIER_INTROUVABLE);
  const type = typeEnLigne(fichier);

  // Le nom d'origine, s'il s'agit d'une pièce jointe : c'est sous celui-là
  // qu'on veut l'enregistrer, pas sous les seize octets tirés au sort. Une
  // image collée dans une description n'a pas de ligne en base et garde donc
  // le sien, ce qui ne se voit pas : on ne l'enregistre pas.
  const nom = attachments.byFile.get(fichier)?.name ?? fichier;

  // Ce qui n'est pas de la liste des types rendus tels quels s'en va en
  // téléchargement, sans type deviné : un fichier déposé sur une carte ne doit
  // jamais s'exécuter sur notre propre origine.
  res.type(type ?? "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Disposition",
    `${type ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(nom)}`,
  );
  // Le nom ne se réemploie jamais : ce qui est derrière une adresse ne change
  // pas, le navigateur peut le garder.
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");

  // Le fichier a disparu du disque alors que sa ligne est restée : l'erreur
  // passe par « next », le rappel de sendFile étant hors de la pile d'Express.
  res.sendFile(chemin, (erreur) => {
    if (erreur && !res.headersSent) next(new HttpError(404, FICHIER_INTROUVABLE));
  });
});
