// Les dépendances entre cartes. Elles s'enregistrent au fil des gestes, comme
// les checklists, et se lisent des deux côtés : poser « bloque » sur une carte
// montre « est bloqué par » sur l'autre.

import { Router } from "express";
import type { Request } from "express";
import { RELATIONS, enregistrement, isRelation, taskReference } from "@milo/shared";
import type { Id, Relation } from "@milo/shared";
import type { TaskCardRow } from "../db/rows.js";
import { badRequest, conflict, orNotFound } from "../lib/http.js";
import { notifier, racine } from "../lib/notify.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { boardOuvert } from "../repositories/boards.js";
import { cardLinks, linkCandidates, linkOf } from "../repositories/links.js";
import { boardOfCard, taskCards } from "../repositories/tasks.js";

const CARTE_INTROUVABLE = "Carte introuvable";
const LIAISON_INTROUVABLE = "Dépendance introuvable";

/** La carte visée, si l'on peut modifier les tâches de son tableau. */
const carteOuverte = (id: unknown, req: Request): TaskCardRow => {
  const card = orNotFound(taskCards.byId.get(id), CARTE_INTROUVABLE);
  boardOuvert(boardOfCard(card), req, "update");
  return card;
};

/**
 * L'autre carte d'une dépendance : une carte, pas un séparateur, sur un
 * tableau que cette personne voit — le sien ou un autre.
 */
const cibleValide = (card: TaskCardRow, targetId: unknown, req: Request): TaskCardRow => {
  const cible = orNotFound(taskCards.byId.get(targetId), CARTE_INTROUVABLE);
  if (cible.id === card.id) badRequest("Une carte ne dépend pas d'elle-même");
  if (cible.kind !== "card") badRequest("Un séparateur ne peut pas être relié");
  boardOuvert(boardOfCard(cible), req);
  return cible;
};

const relationRecue = (valeur: unknown): Relation => {
  if (!isRelation(valeur)) return badRequest("Relation inconnue");
  return valeur;
};

/** La liaison telle qu'elle s'écrit, depuis la carte qui la pose. */
const ecriture = (card: TaskCardRow, cible: TaskCardRow, relation: Relation, sauf: Id = 0) => {
  const { sorte, source } = enregistrement(relation);
  const [sourceId, targetId] = source ? [card.id, cible.id] : [cible.id, card.id];
  if (cardLinks.existante.get({ kind: sorte, source: sourceId, target: targetId, sauf })) {
    conflict("Cette dépendance existe déjà");
  }
  return { sorte, sourceId, targetId };
};

const libelle = (relation: Relation): string =>
  RELATIONS.find((r) => r.value === relation)?.label ?? relation;

const nomDe = (carte: TaskCardRow): string =>
  carte.number > 0 ? `${taskReference(carte.number)} « ${carte.text} »` : `« ${carte.text} »`;

/** Ceux qui suivent l'une ou l'autre carte apprennent le changement. */
const prevenir = (req: Request, cartes: TaskCardRow[], message: (c: TaskCardRow) => string) => {
  for (const carte of cartes) {
    notifier({
      kind: "card",
      targetId: carte.id,
      titre: carte.text,
      message: message(carte),
      auteur: req.user,
      base: racine(req),
    });
  }
};

/** Monté sous `/api/task-cards/:id/links`. */
export const cardLinkRoutes = Router({ mergeParams: true });

// Le picto des cartes reliées se montre sur le tableau : les listes se relisent.
cardLinkRoutes.use(touch("task-lists"));

// Les cartes qu'on peut relier, page par page : celles du tableau d'abord,
// puis celles des autres tableaux. « q » filtre, « offset » avance.
cardLinkRoutes.get("/candidates", (req, res) => {
  const { id } = req.params as { id?: string };
  const card = orNotFound(taskCards.byId.get(id), CARTE_INTROUVABLE);
  const board = boardOuvert(boardOfCard(card), req);
  const offset = Math.max(0, Math.floor(Number(req.query.offset) || 0));
  const recherche = String(req.query.q ?? "").trim();
  res.json(linkCandidates({ id: card.id, board_id: board.id }, req.user.id, recherche, offset));
});

cardLinkRoutes.post("/", (req, res) => {
  const { id } = req.params as { id?: string };
  const card = carteOuverte(id, req);
  const relation = relationRecue(req.body.relation);
  const cible = cibleValide(card, req.body.target_id, req);
  const { sorte, sourceId, targetId } = ecriture(card, cible, relation);

  const { lastInsertRowid } = cardLinks.create.run(sourceId, targetId, sorte, now());
  prevenir(req, [card], () => `a ajouté une dépendance : ${libelle(relation)} ${nomDe(cible)}`);
  prevenir(req, [cible], () => `a ajouté une dépendance avec ${nomDe(card)}`);
  res.status(201).json(linkOf(cardLinks.byId.get(lastInsertRowid)!, card.id, req.user.id));
});

/** Monté sous `/api/card-links`. */
export const linkRoutes = Router();

linkRoutes.use(touch("task-lists"));

/** La liaison visée, et la carte depuis laquelle on la lit : l'une de ses deux cartes. */
const liaisonOuverte = (id: unknown, cardId: unknown, req: Request) => {
  const liaison = orNotFound(cardLinks.byId.get(id), LIAISON_INTROUVABLE);
  const depuis = Number(cardId);
  if (depuis !== liaison.source_id && depuis !== liaison.target_id) {
    badRequest("La carte ne porte pas cette dépendance");
  }
  return { liaison, card: carteOuverte(depuis, req) };
};

// Changer la relation ou l'autre carte d'une dépendance, depuis l'une de ses cartes.
linkRoutes.put("/:id", (req, res) => {
  const { liaison, card } = liaisonOuverte(req.params.id, req.body.card_id, req);
  const relation = relationRecue(req.body.relation);
  const cible = cibleValide(card, req.body.target_id, req);
  const { sorte, sourceId, targetId } = ecriture(card, cible, relation, liaison.id);

  cardLinks.update.run(sourceId, targetId, sorte, liaison.id);
  prevenir(req, [card], () => `a modifié une dépendance : ${libelle(relation)} ${nomDe(cible)}`);
  res.json(linkOf(cardLinks.byId.get(liaison.id)!, card.id, req.user.id));
});

// Supprimée depuis l'une de ses cartes (« ?card= ») : l'autre peut être sur
// un tableau où l'on n'écrit pas.
linkRoutes.delete("/:id", (req, res) => {
  const { liaison, card } = liaisonOuverte(req.params.id, req.query.card, req);
  const autre = taskCards.byId.get(
    card.id === liaison.source_id ? liaison.target_id : liaison.source_id,
  );

  cardLinks.remove.run(liaison.id);
  prevenir(req, [card], () =>
    autre ? `a supprimé la dépendance avec ${nomDe(autre)}` : "a supprimé une dépendance",
  );
  if (autre) prevenir(req, [autre], () => `a supprimé la dépendance avec ${nomDe(card)}`);
  res.status(204).end();
});
