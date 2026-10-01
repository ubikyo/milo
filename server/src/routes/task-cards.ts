// Les cartes d'une liste : création, texte, déplacement, et la fiche complète
// avec ses membres, ses étiquettes et son fil.

import { Router } from "express";
import { isCardKind } from "@milo/shared";
import type { Id } from "@milo/shared";
import { badRequest, forbidden, orNotFound, requireText, toIds } from "../lib/http.js";
import { descriptionPropre } from "../lib/html.js";
import { concernes, notifier, notifierSuppression, racine } from "../lib/notify.js";
import { echeance, horodatage, now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { boardOuvert, boards } from "../repositories/boards.js";
import {
  cardComments,
  cardDetail,
  replaceCardLabels,
  replaceCardMembers,
} from "../repositories/cards.js";
import { COMMENTAIRE_SYSTEME, withAuthor } from "../repositories/comments.js";
import { duplicateTaskCard } from "../repositories/copy-list.js";
import { prochaineReference } from "../repositories/references.js";
import {
  boardOfCard,
  listsWithCards,
  reorderTaskCards,
  taskCards,
  taskLists,
} from "../repositories/tasks.js";

const CARTE_INTROUVABLE = "Carte introuvable";
const COMMENTAIRE_INTROUVABLE = "Commentaire introuvable";

export const taskCardRoutes = Router();

taskCardRoutes.use(touch("task-lists"));

/** La carte visée, si son tableau est ouvert à cette personne. */
const carteOuverte = (id: unknown, user: Express.Request["user"]) => {
  const card = orNotFound(taskCards.byId.get(id), CARTE_INTROUVABLE);
  boardOuvert(boardOfCard(card), user);
  return card;
};

taskCardRoutes.post("/", (req, res) => {
  const text = requireText(req.body.text, "Le texte de la carte est requis");
  const listId = req.body.list_id;
  const kind = req.body.kind ?? "card";
  if (!listId) badRequest("La liste est requise");
  if (!isCardKind(kind)) badRequest("Genre de carte inconnu");

  const list = orNotFound(taskLists.byId.get(listId), "Liste introuvable");
  boardOuvert(list.board_id, req.user);

  // Nouvelle carte ajoutée à la fin de sa liste.
  const { next } = taskCards.nextPosition(list.id);

  const timestamp = now();
  const { lastInsertRowid } = taskCards.create.run(
    list.id,
    text,
    next,
    // Un séparateur ne porte pas de référence, et n'en consomme donc pas.
    kind === "separator" ? 0 : prochaineReference(),
    kind,
    timestamp,
  );

  // Une carte créée depuis un autre mode (« Créer une tâche ») arrive avec sa
  // description : le lien vers l'élément d'où elle vient. Un séparateur n'a
  // pas de fiche, il n'en reçoit pas.
  const description = kind === "separator" ? "" : descriptionPropre(req.body.description ?? "");
  if (description) taskCards.describe.run(description, lastInsertRowid);

  // Le fil d'une carte s'ouvre sur sa création. Un séparateur n'a pas de
  // fiche, donc pas de fil.
  if (kind !== "separator") {
    cardComments.createSystem.run(
      lastInsertRowid,
      req.user.id,
      `Carte créée le ${horodatage(timestamp)}`,
      timestamp,
      timestamp,
    );
  }

  const creee = taskCards.byId.get(lastInsertRowid)!;
  // Suivre une liste, c'est suivre ses cartes : une carte de plus dans la
  // liste est une modification de ce qu'elle contient. Un séparateur, non :
  // il n'a pas de fiche, et rien à ouvrir.
  if (kind !== "separator") {
    notifier({
      kind: "card",
      targetId: creee.id,
      titre: creee.text,
      message: "a ajouté cette carte",
      auteur: req.user,
      base: racine(req),
    });
  }

  res.status(201).json(creee);
});

/**
 * Dupliquer une carte : la copie, avec tout ce qu'elle porte, se pose juste
 * sous l'original, dans la même liste (repositories/copy-list.ts). On la
 * reprend ensuite comme base d'une autre.
 */
taskCardRoutes.post("/:id/duplicate", (req, res) => {
  const source = carteOuverte(req.params.id, req.user);
  const copie = taskCards.byId.get(duplicateTaskCard(source.id, req.user.id))!;

  if (copie.kind !== "separator") {
    notifier({
      kind: "card",
      targetId: copie.id,
      titre: copie.text,
      message: "a ajouté cette carte",
      auteur: req.user,
      base: racine(req),
    });
  }

  res.status(201).json(copie);
});

// Déplacement dans la liste ou d'une liste vers une autre. Déclaré avant
// « /:id », sinon « reorder » serait interprété comme un identifiant.
// L'ordre reçu est celui, complet, de la liste d'accueil : les cartes venues
// d'une autre liste y sont rattachées au passage.
taskCardRoutes.put("/reorder", (req, res) => {
  const { list_id, ids } = req.body;
  if (!Array.isArray(ids)) badRequest("ids doit être un tableau");
  const list = orNotFound(list_id ? taskLists.byId.get(list_id) : undefined, "Liste introuvable");
  boardOuvert(list.board_id, req.user);

  const ordre = toIds(ids);

  // Une carte ne se déplace qu'entre les listes d'un même tableau.
  const connues = new Set(taskCards.idsOfBoard.all(list.board_id).map((c) => c.id));
  if (ordre.some((id) => !connues.has(id))) {
    badRequest("Une carte n'appartient pas à ce tableau");
  }

  // L'ordre reçu doit couvrir toutes les cartes déjà dans la liste d'accueil,
  // sinon celles omises garderaient une position devenue fausse.
  const presentes = new Set(ordre);
  if (taskCards.idsOfList.all(list.id).some((c) => !presentes.has(c.id))) {
    badRequest("L'ordre reçu ne couvre pas toutes les cartes de cette liste");
  }

  // D'où vient chaque carte, avant que l'écriture ne l'efface. Glisser une
  // carte dans sa propre liste ne change rien à ce qu'elle dit et ne notifie
  // personne ; la faire passer de « À faire » à « Terminé », si.
  const listeAvant = new Map<Id, Id>();
  for (const id of ordre) {
    const carte = taskCards.byId.get(id);
    if (carte) listeAvant.set(carte.id, carte.list_id);
  }

  reorderTaskCards(list.id, ordre);

  for (const [cardId, origine] of listeAvant) {
    if (origine === list.id) continue;
    const carte = taskCards.byId.get(cardId);
    if (!carte) continue;
    notifier({
      kind: "card",
      targetId: carte.id,
      titre: carte.text,
      message: `a déplacé cette carte vers « ${list.name} »`,
      auteur: req.user,
      base: racine(req),
      listeOrigine: origine,
    });
  }

  res.json(listsWithCards(list.board_id));
});

taskCardRoutes.get("/:id", (req, res) => {
  res.json(cardDetail(carteOuverte(req.params.id, req.user)));
});

/**
 * Où se trouve cette carte : sa liste, son tableau, sa société. Sert au lien
 * qui l'ouvre — l'application doit se placer sur le bon tableau avant de
 * pouvoir montrer la fiche, et le client ne peut pas le deviner d'une carte
 * qu'il n'affiche pas encore.
 */
taskCardRoutes.get("/:id/emplacement", (req, res) => {
  const card = carteOuverte(req.params.id, req.user);
  const list = orNotFound(taskLists.byId.get(card.list_id), "Liste introuvable");
  const board = orNotFound(boards.byId.get(list.board_id), "Tableau introuvable");

  res.json({ company_id: board.company_id, board_id: board.id, list_id: list.id });
});

// Modification d'une carte : son texte seul depuis le tableau, sa fiche
// entière depuis son tiroir. Chaque champ absent du corps reste tel quel.
taskCardRoutes.put("/:id", (req, res) => {
  const existing = carteOuverte(req.params.id, req.user);
  const text = requireText(req.body.text ?? existing.text, "Le texte de la carte est requis");
  const description = descriptionPropre(req.body.description ?? existing.description ?? "");
  const dueDate = echeance(req.body.due_date, existing.due_date);

  taskCards.update.run(text, description, dueDate, existing.id);

  if (Array.isArray(req.body.member_ids)) {
    replaceCardMembers(existing.id, toIds(req.body.member_ids));
  }
  if (Array.isArray(req.body.label_ids)) {
    replaceCardLabels(existing.id, toIds(req.body.label_ids), boardOfCard(existing));
  }

  const suivante = taskCards.byId.get(existing.id)!;
  // Prévenir vient après l'écriture, jamais avant : on ne notifie que ce qui
  // est enregistré. Les suiveurs de la liste sont prévenus au même titre que
  // ceux de la carte (lib/notify.ts).
  notifier({
    kind: "card",
    targetId: suivante.id,
    titre: suivante.text,
    message: "a modifié la fiche",
    auteur: req.user,
    base: racine(req),
  });

  res.json(cardDetail(suivante));
});

// Suppression d'une carte ou d'un séparateur : ses membres, étiquettes,
// checklists, pièces jointes et commentaires partent avec elle.
taskCardRoutes.delete("/:id", (req, res) => {
  const existing = carteOuverte(req.params.id, req.user);
  // Un séparateur n'est suivi par personne pour lui-même : il n'a pas de
  // fiche. Sa disparition ne s'annonce pas.
  const destinataires = existing.kind === "separator" ? [] : concernes.carte(existing.id);
  taskCards.remove.run(existing.id);
  notifierSuppression({
    kind: "card",
    targetId: existing.id,
    titre: existing.text,
    message: "a supprimé la carte",
    auteur: req.user,
    destinataires,
    disparu: true,
  });
  res.status(204).end();
});

// --- Fil d'une carte -------------------------------------------------------

taskCardRoutes.post("/:id/comments", (req, res) => {
  const card = carteOuverte(req.params.id, req.user);
  const text = requireText(req.body.text, "text est requis");

  const timestamp = now();
  const { lastInsertRowid } = cardComments.create.run(
    card.id,
    req.user.id,
    text,
    timestamp,
    timestamp,
  );
  notifier({
    kind: "card",
    targetId: card.id,
    titre: card.text,
    message: "a commenté",
    auteur: req.user,
    base: racine(req),
  });

  res.status(201).json(withAuthor(cardComments.byId.get(lastInsertRowid)!));
});

/** Monté sous `/api/card-comments`. */
export const cardCommentRoutes = Router();

cardCommentRoutes.use(touch("task-lists"));

cardCommentRoutes.put("/:id", (req, res) => {
  const comment = orNotFound(cardComments.byId.get(req.params.id), COMMENTAIRE_INTROUVABLE);
  if (comment.system) forbidden(COMMENTAIRE_SYSTEME);
  carteOuverte(comment.card_id, req.user);
  const text = requireText(req.body.text, "text est requis");

  // Un texte identique n'est pas une modification : la date ne bouge pas, et
  // le commentaire ne se met pas à porter « (modifié) ».
  if (text === comment.text) {
    res.json(withAuthor(comment));
    return;
  }

  cardComments.update.run(text, now(), comment.id);
  const carte = taskCards.byId.get(comment.card_id);
  if (carte) {
    notifier({
      kind: "card",
      targetId: carte.id,
      titre: carte.text,
      message: "a modifié un commentaire",
      auteur: req.user,
      base: racine(req),
    });
  }
  res.json(withAuthor(cardComments.byId.get(comment.id)!));
});

cardCommentRoutes.delete("/:id", (req, res) => {
  const comment = orNotFound(cardComments.byId.get(req.params.id), COMMENTAIRE_INTROUVABLE);
  if (comment.system) forbidden(COMMENTAIRE_SYSTEME);
  const carte = carteOuverte(comment.card_id, req.user);

  cardComments.remove.run(comment.id);
  notifierSuppression({
    kind: "card",
    targetId: carte.id,
    titre: carte.text,
    message: "a supprimé un commentaire",
    auteur: req.user,
    destinataires: concernes.carte(carte.id),
    disparu: false,
  });
  res.status(204).end();
});
