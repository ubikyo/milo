// A list's cards: creation, text, moving, and the full record with its
// members, labels and thread.

import { Router } from "express";
import type { Request } from "express";
import {
  REMINDERS,
  RECURRENCES,
  isCardKind,
  isDueForm,
  isReminder,
  isRecurrence,
  isCoverRotation,
} from "@milo/shared";
import type { Id, Right } from "@milo/shared";
import { badRequest, forbidden, orNotFound, requireText, toIds } from "../lib/http.js";
import { cleanDescription } from "../lib/html.js";
import { quote, logAction, date, changes, list, editMessage } from "../lib/history.js";
import type { Field } from "../lib/history.js";
import { concerned, notify, notifyLinked, notifyDeletion, root } from "../lib/notify.js";
import { due, now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { openTaskBoard, boards } from "../repositories/boards.js";
import {
  cardComments,
  cardDetail,
  labelsOf,
  membersOf,
  replaceCardLabels,
  replaceCardMembers,
} from "../repositories/cards.js";
import { SYSTEM_COMMENT, creationNote, withAuthor } from "../repositories/comments.js";
import { duplicateTaskCard } from "../repositories/copy-list.js";
import { nextReference } from "../repositories/references.js";
import {
  boardOfCard,
  listsWithCards,
  reorderTaskCards,
  taskCards,
  taskLists,
} from "../repositories/tasks.js";
import { boardContext, contexts } from "../repositories/contexts.js";

const CARD_NOT_FOUND = "Carte introuvable";
const COMMENT_NOT_FOUND = "Commentaire introuvable";

/** What the thread notes about a card when its record changes (lib/history.ts). */
const photo = (id: Id): Field[] => {
  const card = taskCards.byId.get(id)!;
  return [
    { label: "Titre", value: quote(card.text) },
    {
      label: "Contexte",
      value: quote(card.context_id ? contexts.byId.get(card.context_id)?.name : null),
    },
    { label: "Description", value: card.description ?? "", opaque: true },
    { label: "Début", value: card.start_date ? date(card.start_date) : "—" },
    { label: "Échéance", value: date(card.due_date) },
    { label: "Récurrence", value: labelOf(RECURRENCES, card.recurrence) },
    { label: "Rappel", value: labelOf(REMINDERS, card.reminder) },
    { label: "Membres", value: list(membersOf(id).map((m) => m.name)) },
    { label: "Étiquettes", value: list(labelsOf(id).map((l) => l.name)) },
  ];
};

/** The label of a recurrence or a reminder, for the thread. */
const labelOf = (
  options: readonly { value: string; label: string }[],
  value: string,
): string => options.find((o) => o.value === value)?.label ?? "—";

/** The start of a period: "AAAA-MM-JJ", or empty. When absent, it stays as is. */
const start = (value: unknown, current: string): string => {
  if (value === undefined) return current;
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) badRequest("Date de début invalide");
  return text;
};

/** A value from a closed list. When absent, it stays as is. */
const choice = <T extends string>(value: unknown, current: T, isValid: (v: unknown) => v is T): T => {
  if (value === undefined) return current;
  const text: unknown = value ?? "";
  if (isValid(text)) return text;
  return badRequest("Valeur inconnue");
};

/** A number from a closed list. When absent, it stays as is. */
const numberChoice = (value: unknown, current: number, isValid: (v: unknown) => v is number): number => {
  if (value === undefined) return current;
  if (isValid(value)) return value;
  return badRequest("Valeur inconnue");
};

export const taskCardRoutes = Router();

taskCardRoutes.use(touch("task-lists"));

/**
 * The targeted card, if its board is open to this person — with `right` on
 * top in its company when writing to it. Its thread is read with it, and
 * writing to it means editing it.
 */
const openCard = (id: unknown, req: Request, right: Right = "view") => {
  const card = orNotFound(taskCards.byId.get(id), CARD_NOT_FOUND);
  openTaskBoard(boardOfCard(card), req, right);
  return card;
};

taskCardRoutes.post("/", (req, res) => {
  const text = requireText(req.body.text, "Le texte de la carte est requis");
  const listId = req.body.list_id;
  const kind = req.body.kind ?? "card";
  if (!listId) badRequest("La liste est requise");
  if (!isCardKind(kind)) badRequest("Genre de carte inconnu");

  const list = orNotFound(taskLists.byId.get(listId), "Liste introuvable");
  openTaskBoard(list.board_id, req, "create");
  // The given context, failing that the board's first.
  const context = boardContext(list.board_id, req.body.context_id);

  // New card added at the end of its list.
  const { next } = taskCards.nextPosition(list.id);

  const timestamp = now();
  const { lastInsertRowid } = taskCards.create.run(
    list.id,
    text,
    next,
    // A separator carries no reference, and so consumes none.
    kind === "separator" ? 0 : nextReference(),
    kind,
    context,
    timestamp,
  );

  // A card created from another mode ("Créer une tâche") arrives with its
  // description: the link to the item it comes from. A separator has no
  // record, it gets none.
  const description = kind === "separator" ? "" : cleanDescription(req.body.description ?? "");
  if (description) taskCards.describe.run(description, lastInsertRowid);

  // A card's thread opens on its creation. A separator has no record, hence
  // no thread.
  if (kind !== "separator") {
    cardComments.createSystem.run(
      lastInsertRowid,
      null,
      creationNote("Carte créée", timestamp, req.user.id),
      timestamp,
      timestamp,
    );
  }

  const created = taskCards.byId.get(lastInsertRowid)!;
  // Following a list means following its cards: one more card in the list is
  // a modification of what it contains. Not a separator: it has no record,
  // and nothing to open.
  if (kind !== "separator") {
    notify({
      kind: "card",
      targetId: created.id,
      title: created.text,
      message: "a ajouté cette carte",
      author: req.user,
      base: root(req),
    });
  }

  res.status(201).json(created);
});

/**
 * Duplicate a card: the copy, with everything it carries, is placed right
 * under the original, in the same list (repositories/copy-list.ts). It can
 * then be taken as the basis for another.
 */
taskCardRoutes.post("/:id/duplicate", (req, res) => {
  const source = openCard(req.params.id, req, "create");
  const copy = taskCards.byId.get(duplicateTaskCard(source.id, req.user.id))!;

  if (copy.kind !== "separator") {
    notify({
      kind: "card",
      targetId: copy.id,
      title: copy.text,
      message: "a ajouté cette carte",
      author: req.user,
      base: root(req),
    });
  }

  res.status(201).json(copy);
});

// Moving within the list or from one list to another. Declared before
// "/:id", otherwise "reorder" would be interpreted as an id. The received
// order is the complete one of the destination list: cards coming from
// another list are attached to it along the way.
taskCardRoutes.put("/reorder", (req, res) => {
  const { list_id, ids } = req.body;
  if (!Array.isArray(ids)) badRequest("ids doit être un tableau");
  const list = orNotFound(list_id ? taskLists.byId.get(list_id) : undefined, "Liste introuvable");
  openTaskBoard(list.board_id, req, "update");

  const order = toIds(ids);

  // A card only moves between the lists of the same board.
  const known = new Set(taskCards.idsOfBoard.all(list.board_id).map((c) => c.id));
  if (order.some((id) => !known.has(id))) {
    badRequest("Une carte n'appartient pas à ce tableau");
  }

  // A chosen context hides the cards of the others: the received order only
  // names those one sees. They take back, in their new order, the places they
  // held; hidden cards keep theirs, and those coming from another list are
  // placed after.
  const received = new Set(order);
  const remaining = [...order];
  const full = taskCards.idsOfList
    .all(list.id)
    .map((c) => (received.has(c.id) ? (remaining.shift() ?? c.id) : c.id));
  const fullOrder = [...full, ...remaining];

  // Where each card comes from, before the write erases it. Dragging a card
  // within its own list changes nothing about what it says and notifies no
  // one; moving it from "À faire" to "Terminé" does.
  const listBefore = new Map<Id, Id>();
  for (const id of fullOrder) {
    const card = taskCards.byId.get(id);
    if (card) listBefore.set(card.id, card.list_id);
  }

  reorderTaskCards(list.id, fullOrder);

  for (const [cardId, origin] of listBefore) {
    if (origin === list.id) continue;
    const card = taskCards.byId.get(cardId);
    if (!card) continue;
    if (card.kind !== "separator") {
      logAction(
        "card",
        card.id,
        req.user,
        changes(
          [{ label: "Liste", value: quote(taskLists.byId.get(origin)?.name) }],
          [{ label: "Liste", value: quote(list.name) }],
        ),
      );
    }
    notify({
      kind: "card",
      targetId: card.id,
      title: card.text,
      message: `a déplacé cette carte vers « ${list.name} »`,
      author: req.user,
      base: root(req),
      sourceList: origin,
    });
  }

  res.json(listsWithCards(list.board_id));
});

taskCardRoutes.get("/:id", (req, res) => {
  res.json(cardDetail(openCard(req.params.id, req), req.user.id));
});

/**
 * Where this card is: its list, board, view. Used for the link that opens
 * it — the application must position itself on the right board before it
 * can show the record, and the client cannot guess it from a card it does
 * not display yet.
 */
taskCardRoutes.get("/:id/location", (req, res) => {
  const card = openCard(req.params.id, req);
  const list = orNotFound(taskLists.byId.get(card.list_id), "Liste introuvable");
  const board = orNotFound(boards.byId.get(list.board_id), "Tableau introuvable");

  res.json({ view_id: board.view_id, board_id: board.id, list_id: list.id });
});

// Editing a card: its text alone from the board, its whole record from its
// drawer. Each field absent from the body stays as is.
taskCardRoutes.put("/:id", (req, res) => {
  const existing = openCard(req.params.id, req, "update");
  const text = requireText(req.body.text ?? existing.text, "Le texte de la carte est requis");
  const description = cleanDescription(req.body.description ?? existing.description ?? "");
  const dueDate = due(req.body.due_date, existing.due_date);
  // Without a due date, neither start, nor recurrence, nor reminder: they
  // have nothing to relate to.
  const shape = dueDate ? choice(req.body.due_form, existing.due_form, isDueForm) : "date";
  // A date alone has no start.
  const startDate =
    dueDate && shape === "period" ? start(req.body.start_date, existing.start_date) : "";
  const recurrence = dueDate ? choice(req.body.recurrence, existing.recurrence, isRecurrence) : "";
  const reminder = dueDate ? choice(req.body.reminder, existing.reminder, isReminder) : "";
  // A separator has no record, hence no thread to note what changes.
  const before = existing.kind === "separator" ? null : photo(existing.id);

  const context =
    req.body.context_id === undefined
      ? existing.context_id
      : boardContext(boardOfCard(existing), req.body.context_id);

  taskCards.update.run({
    id: existing.id,
    text,
    description,
    due_date: dueDate,
    start_date: startDate,
    due_form: shape,
    recurrence,
    reminder,
    context_id: context,
    cover_interval: numberChoice(req.body.cover_interval, existing.cover_interval, isCoverRotation),
  });

  const membersBefore = new Set(membersOf(existing.id).map((m) => m.id));
  if (Array.isArray(req.body.member_ids)) {
    replaceCardMembers(existing.id, toIds(req.body.member_ids));
  }
  if (Array.isArray(req.body.label_ids)) {
    replaceCardLabels(existing.id, toIds(req.body.label_ids), boardOfCard(existing));
  }

  const next = taskCards.byId.get(existing.id)!;
  // Notifying comes after the write, never before: we only notify what is
  // saved. The list's followers and the card's members are notified just
  // like those who follow it (lib/notify.ts). A record saved without changes
  // notes nothing and notifies no one.
  const rows = before ? changes(before, photo(next.id)) : [];
  // New actors have their own notification, on screen and by e-mail; the
  // modification one does not notify them a second time.
  const attached =
    existing.kind === "separator"
      ? []
      : notifyLinked({
          kind: "card",
          targetId: next.id,
          title: next.text,
          message: "vous a ajouté comme acteur",
          recipients: membersOf(next.id)
            .map((m) => m.id)
            .filter((id) => !membersBefore.has(id)),
          author: req.user,
          base: root(req),
        });
  if (rows.length) {
    logAction("card", next.id, req.user, rows);
    notify({
      kind: "card",
      targetId: next.id,
      title: next.text,
      message: editMessage(rows),
      author: req.user,
      except: attached,
      base: root(req),
    });
  }

  res.json(cardDetail(next, req.user.id));
});

// Deleting a card or a separator: its members, labels, checklists,
// attachments and comments go with it.
taskCardRoutes.delete("/:id", (req, res) => {
  const existing = openCard(req.params.id, req, "delete");
  // A separator is followed by no one for itself: it has no record. Its
  // disappearance is not announced.
  const recipients = existing.kind === "separator" ? [] : concerned.card(existing.id);
  taskCards.remove.run(existing.id);
  notifyDeletion({
    kind: "card",
    targetId: existing.id,
    title: existing.text,
    message: "a supprimé la carte",
    author: req.user,
    recipients,
    vanished: true,
  });
  res.status(204).end();
});

// --- A card's thread -------------------------------------------------------

taskCardRoutes.post("/:id/comments", (req, res) => {
  const card = openCard(req.params.id, req, "update");
  const text = requireText(req.body.text, "text est requis");

  const timestamp = now();
  const { lastInsertRowid } = cardComments.create.run(
    card.id,
    req.user.id,
    text,
    timestamp,
    timestamp,
  );
  notify({
    kind: "card",
    targetId: card.id,
    title: card.text,
    message: "a commenté",
    author: req.user,
    base: root(req),
  });

  res.status(201).json(withAuthor(cardComments.byId.get(lastInsertRowid)!));
});

/** Mounted under `/api/card-comments`. */
export const cardCommentRoutes = Router();

cardCommentRoutes.use(touch("task-lists"));

cardCommentRoutes.put("/:id", (req, res) => {
  const comment = orNotFound(cardComments.byId.get(req.params.id), COMMENT_NOT_FOUND);
  if (comment.system) forbidden(SYSTEM_COMMENT);
  openCard(comment.card_id, req, "update");
  const text = requireText(req.body.text, "text est requis");

  // An identical text is not a modification: the date does not move, and the
  // comment does not start carrying "(modifié)".
  if (text === comment.text) {
    res.json(withAuthor(comment));
    return;
  }

  cardComments.update.run(text, now(), comment.id);
  const card = taskCards.byId.get(comment.card_id);
  if (card) {
    notify({
      kind: "card",
      targetId: card.id,
      title: card.text,
      message: "a modifié un commentaire",
      author: req.user,
      base: root(req),
    });
  }
  res.json(withAuthor(cardComments.byId.get(comment.id)!));
});

cardCommentRoutes.delete("/:id", (req, res) => {
  const comment = orNotFound(cardComments.byId.get(req.params.id), COMMENT_NOT_FOUND);
  if (comment.system) forbidden(SYSTEM_COMMENT);
  const card = openCard(comment.card_id, req, "update");

  cardComments.remove.run(comment.id);
  notifyDeletion({
    kind: "card",
    targetId: card.id,
    title: card.text,
    message: "a supprimé un commentaire",
    author: req.user,
    recipients: concerned.card(card.id),
    vanished: false,
  });
  res.status(204).end();
});
