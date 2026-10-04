// Dependencies between cards. They are saved as gestures happen, like
// checklists, and read from both sides: setting "bloque" on one card shows
// "est bloqué par" on the other.

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

/** The targeted card, if the tasks of its board can be edited. */
const openCard = (id: unknown, req: Request): TaskCardRow => {
  const card = orNotFound(taskCards.byId.get(id), CARD_NOT_FOUND);
  openTaskBoard(boardOfCard(card), req, "update");
  return card;
};

/**
 * The other card of a dependency: a card, not a separator, on a board this
 * person sees — their own or another.
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

/** The link as it is written, from the card that sets it. */
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

/** Those following either card learn of the change. */
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

/** Mounted under `/api/task-cards/:id/links`. */
export const cardLinkRoutes = Router({ mergeParams: true });

// The linked-cards icon shows on the board: the lists are re-read.
cardLinkRoutes.use(touch("task-lists"));

// The cards that can be linked, page by page: those of the board first,
// then those of the other boards. "q" filters, "offset" advances.
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

/** Mounted under `/api/card-links`. */
export const linkRoutes = Router();

linkRoutes.use(touch("task-lists"));

/** The targeted link, and the card it is read from: one of its two cards. */
const openLinkRecord = (id: unknown, cardId: unknown, req: Request) => {
  const linkRecord = orNotFound(cardLinks.byId.get(id), LINK_NOT_FOUND);
  const since = Number(cardId);
  if (since !== linkRecord.source_id && since !== linkRecord.target_id) {
    badRequest("La carte ne porte pas cette dépendance");
  }
  return { linkRecord, card: openCard(since, req) };
};

// Change the relation or the other card of a dependency, from one of its cards.
linkRoutes.put("/:id", (req, res) => {
  const { linkRecord, card } = openLinkRecord(req.params.id, req.body.card_id, req);
  const relation = receivedRelation(req.body.relation);
  const target = validTarget(card, req.body.target_id, req);
  const { kind, sourceId, targetId } = writing(card, target, relation, linkRecord.id);

  cardLinks.update.run(sourceId, targetId, kind, linkRecord.id);
  notifyCards(req, [card], () => `a modifié une dépendance : ${label(relation)} ${nameOf(target)}`);
  res.json(linkOf(cardLinks.byId.get(linkRecord.id)!, card.id, req.user.id));
});

// Deleted from one of its cards ("?card="): the other may be on a board we
// don't write to.
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
