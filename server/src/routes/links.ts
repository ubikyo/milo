// Les dépendances entre cartes. Elles s'enregistrent au fil des gestes, comme
// les checklists, et se lisent des deux côtés : poser « bloque » sur une carte
// montre « est bloqué par » sur l'autre.

import { Router } from "express";
import type { Request } from "express";
import { RELATIONS, registration, isRelation, taskReference } from "@milo/shared";
import type { Id, Relation } from "@milo/shared";
import type { TaskCardRow } from "../db/rows.js";
import { badRequest, conflict, orNotFound } from "../lib/http.js";
import { notify, root } from "../lib/notify.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { openTaskBoard } from "../repositories/boards.js";
import { cardLinks, linkCandidates, linkOf } from "../repositories/links.js";
import { boardOfCard, taskCards } from "../repositories/tasks.js";

const CARD_NOT_FOUND = "Carte introuvable";
const LINK_NOT_FOUND = "Dépendance introuvable";

/** La carte visée, si l'on peut modifier les tâches de son tableau. */
const openCard = (id: unknown, req: Request): TaskCardRow => {
  const card = orNotFound(taskCards.byId.get(id), CARD_NOT_FOUND);
  openTaskBoard(boardOfCard(card), req, "update");
  return card;
};

/**
 * L'autre carte d'une dépendance : une carte, pas un séparateur, sur un
 * tableau que cette personne voit — le sien ou un autre.
 */
const validTarget = (card: TaskCardRow, targetId: unknown, req: Request): TaskCardRow => {
  const target = orNotFound(taskCards.byId.get(targetId), CARD_NOT_FOUND);
  if (target.id === card.id) badRequest("Une carte ne dépend pas d'elle-même");
  if (target.kind !== "card") badRequest("Un séparateur ne peut pas être relié");
  openTaskBoard(boardOfCard(target), req);
  return target;
};

const receivedRelation = (value: unknown): Relation => {
  if (!isRelation(value)) return badRequest("Relation inconnue");
  return value;
};

/** La liaison telle qu'elle s'écrit, depuis la carte qui la pose. */
const writing = (card: TaskCardRow, target: TaskCardRow, relation: Relation, except: Id = 0) => {
  const { kind, source } = registration(relation);
  const [sourceId, targetId] = source ? [card.id, target.id] : [target.id, card.id];
  if (cardLinks.existing.get({ kind: kind, source: sourceId, target: targetId, except })) {
    conflict("Cette dépendance existe déjà");
  }
  return { kind, sourceId, targetId };
};

const label = (relation: Relation): string =>
  RELATIONS.find((r) => r.value === relation)?.label ?? relation;

const nameOf = (card: TaskCardRow): string =>
  card.number > 0 ? `${taskReference(card.number)} « ${card.text} »` : `« ${card.text} »`;

/** Ceux qui suivent l'une ou l'autre carte apprennent le changement. */
const notifyCards = (req: Request, cards: TaskCardRow[], message: (c: TaskCardRow) => string) => {
  for (const card of cards) {
    notify({
      kind: "card",
      targetId: card.id,
      title: card.text,
      message: message(card),
      author: req.user,
      base: root(req),
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
  const card = orNotFound(taskCards.byId.get(id), CARD_NOT_FOUND);
  const board = openTaskBoard(boardOfCard(card), req);
  const offset = Math.max(0, Math.floor(Number(req.query.offset) || 0));
  const search = String(req.query.q ?? "").trim();
  res.json(linkCandidates({ id: card.id, board_id: board.id }, req.user.id, search, offset));
});

cardLinkRoutes.post("/", (req, res) => {
  const { id } = req.params as { id?: string };
  const card = openCard(id, req);
  const relation = receivedRelation(req.body.relation);
  const target = validTarget(card, req.body.target_id, req);
  const { kind, sourceId, targetId } = writing(card, target, relation);

  const { lastInsertRowid } = cardLinks.create.run(sourceId, targetId, kind, now());
  notifyCards(req, [card], () => `a ajouté une dépendance : ${label(relation)} ${nameOf(target)}`);
  notifyCards(req, [target], () => `a ajouté une dépendance avec ${nameOf(card)}`);
  res.status(201).json(linkOf(cardLinks.byId.get(lastInsertRowid)!, card.id, req.user.id));
});

/** Monté sous `/api/card-links`. */
export const linkRoutes = Router();

linkRoutes.use(touch("task-lists"));

/** La liaison visée, et la carte depuis laquelle on la lit : l'une de ses deux cartes. */
const openLinkRecord = (id: unknown, cardId: unknown, req: Request) => {
  const linkRecord = orNotFound(cardLinks.byId.get(id), LINK_NOT_FOUND);
  const since = Number(cardId);
  if (since !== linkRecord.source_id && since !== linkRecord.target_id) {
    badRequest("La carte ne porte pas cette dépendance");
  }
  return { linkRecord, card: openCard(since, req) };
};

// Changer la relation ou l'autre carte d'une dépendance, depuis l'une de ses cartes.
linkRoutes.put("/:id", (req, res) => {
  const { linkRecord, card } = openLinkRecord(req.params.id, req.body.card_id, req);
  const relation = receivedRelation(req.body.relation);
  const target = validTarget(card, req.body.target_id, req);
  const { kind, sourceId, targetId } = writing(card, target, relation, linkRecord.id);

  cardLinks.update.run(sourceId, targetId, kind, linkRecord.id);
  notifyCards(req, [card], () => `a modifié une dépendance : ${label(relation)} ${nameOf(target)}`);
  res.json(linkOf(cardLinks.byId.get(linkRecord.id)!, card.id, req.user.id));
});

// Supprimée depuis l'une de ses cartes (« ?card= ») : l'autre peut être sur
// un tableau où l'on n'écrit pas.
linkRoutes.delete("/:id", (req, res) => {
  const { linkRecord, card } = openLinkRecord(req.params.id, req.query.card, req);
  const other = taskCards.byId.get(
    card.id === linkRecord.source_id ? linkRecord.target_id : linkRecord.source_id,
  );

  cardLinks.remove.run(linkRecord.id);
  notifyCards(req, [card], () =>
    other ? `a supprimé la dépendance avec ${nameOf(other)}` : "a supprimé une dépendance",
  );
  if (other) notifyCards(req, [other], () => `a supprimé la dépendance avec ${nameOf(card)}`);
  res.status(204).end();
});
