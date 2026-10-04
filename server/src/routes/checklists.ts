// A card's checklists and their items. Everything is saved as gestures happen,
// without waiting for "Enregistrer", and everything goes with the card
// (ON DELETE CASCADE).

import { Router } from "express";
import type { Request } from "express";
import type { Id } from "@milo/shared";
import { badRequest, orNotFound, requireText, toIds } from "../lib/http.js";
import { concerned, notify, notifyLinked, notifyDeletion, root } from "../lib/notify.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { openTaskBoard } from "../repositories/boards.js";
import {
  checklistItems,
  checklistOfItem,
  checklistWithItems,
  checklists,
  checklistsOfCard,
  itemMemberIds,
  itemsOfChecklist,
  reorderChecklistItems,
  reorderChecklists,
  replaceChecklistItemMembers,
} from "../repositories/cards.js";
import { boardOfCard, taskCards } from "../repositories/tasks.js";

const CHECKLIST_NOT_FOUND = "Checklist introuvable";
const ITEM_NOT_FOUND = "Élément introuvable";
const CARD_NOT_FOUND = "Carte introuvable";

/**
 * A due date is written "AAAA-MM-JJ", as Mantine's pickers produce it.
 * Anything else means "no date" rather than an error: the field is
 * optional.
 */
const parseDueDate = (value: unknown): string =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "")) ? String(value) : "";

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

const openChecklist = (id: unknown, req: Request) => {
  const checklist = orNotFound(checklists.byId.get(id), CHECKLIST_NOT_FOUND);
  openCard(checklist.card_id, req);
  return checklist;
};

/**
 * A checklist has changed: it is the card carrying it that is followed, and
 * that the notification names. Reorderings don't call this function —
 * dragging an item doesn't change what the checklist says.
 */
const editedCard = (cardId: unknown, req: Request, except: Id[] = []): void => {
  const card = taskCards.byId.get(cardId);
  if (!card) return;
  notify({
    kind: "card",
    targetId: card.id,
    title: card.text,
    message: "a modifié une checklist",
    author: req.user,
    except,
    base: root(req),
  });
};

/** A checklist or one of its items deleted: those following the card are told. */
const deletionOnCard = (cardId: unknown, req: Request, message: string): void => {
  const card = taskCards.byId.get(cardId);
  if (!card) return;
  notifyDeletion({
    kind: "card",
    targetId: card.id,
    title: card.text,
    message,
    author: req.user,
    recipients: concerned.card(card.id),
    vanished: false,
  });
};

/** Mounted under `/api/task-cards/:id/checklists`. */
export const cardChecklistRoutes = Router({ mergeParams: true });

cardChecklistRoutes.use(touch("task-lists"));

cardChecklistRoutes.post("/", (req, res) => {
  const { id } = req.params as { id?: string };
  const card = openCard(id, req);
  const title = String(req.body.title ?? "Checklist").trim() || "Checklist";

  const { next } = checklists.nextPosition(card.id);
  const { lastInsertRowid } = checklists.create.run(card.id, title, next, now());

  editedCard(card.id, req);
  res.status(201).json({ ...checklists.byId.get(lastInsertRowid), items: [] });
});

// The received order is the complete one of the card's checklists.
cardChecklistRoutes.put("/reorder", (req, res) => {
  const { id } = req.params as { id?: string };
  const card = openCard(id, req);
  const { ids } = req.body;
  if (!Array.isArray(ids)) badRequest("ids doit être un tableau");

  const order = toIds(ids);
  const known = new Set(checklists.idsOfCard.all(card.id).map((c) => c.id));
  // A checklist can only be dragged within its card, and the received order
  // must cover them all: otherwise the omitted ones would keep a position
  // that has become wrong.
  if (order.length !== known.size || order.some((id) => !known.has(id))) {
    badRequest("L'ordre reçu ne couvre pas les checklists de cette carte");
  }

  reorderChecklists(card.id, order);
  editedCard(card.id, req);
  res.json(checklistsOfCard(card.id));
});

/** Mounted under `/api/checklists`. */
export const checklistRoutes = Router();

checklistRoutes.use(touch("task-lists"));

checklistRoutes.put("/:id", (req, res) => {
  const checklist = openChecklist(req.params.id, req);
  const title = requireText(
    req.body.title ?? checklist.title,
    "Le titre de la checklist est requis",
  );

  checklists.rename.run(title, checklist.id);

  editedCard(checklist.card_id, req);
  res.json(checklistWithItems(checklists.byId.get(checklist.id)!));
});

checklistRoutes.delete("/:id", (req, res) => {
  const checklist = openChecklist(req.params.id, req);
  checklists.remove.run(checklist.id);

  deletionOnCard(
    checklist.card_id,
    req,
    `a supprimé la checklist « ${checklist.title} »`,
  );
  res.status(204).end();
});

// An item is born at the bottom of its checklist, with no label: it is then
// typed in place.
checklistRoutes.post("/:id/items", (req, res) => {
  const checklist = openChecklist(req.params.id, req);
  const text = String(req.body.text ?? "").trim();

  const { next } = checklistItems.nextPosition(checklist.id);
  const { lastInsertRowid } = checklistItems.create.run(checklist.id, text, next, now());

  editedCard(checklist.card_id, req);
  res.status(201).json({ ...checklistItems.byId.get(lastInsertRowid), members: [] });
});

// The received order is the complete one of the checklist's items.
checklistRoutes.put("/:id/items/reorder", (req, res) => {
  const checklist = openChecklist(req.params.id, req);
  const { ids } = req.body;
  if (!Array.isArray(ids)) badRequest("ids doit être un tableau");

  const order = toIds(ids);
  const known = new Set(checklistItems.idsOfChecklist.all(checklist.id).map((i) => i.id));
  // An item can only be dragged within its own checklist, and the received
  // order must cover them all: otherwise the omitted ones would keep a
  // position that has become wrong.
  if (order.length !== known.size || order.some((id) => !known.has(id))) {
    badRequest("L'ordre reçu ne couvre pas les éléments de cette checklist");
  }

  reorderChecklistItems(checklist.id, order);
  editedCard(checklist.card_id, req);
  res.json({ ...checklist, items: itemsOfChecklist(checklist.id) });
});

/** Mounted under `/api/checklist-items`. */
export const checklistItemRoutes = Router();

checklistItemRoutes.use(touch("task-lists"));

// Every field absent from the body stays as is: ticking a box erases neither
// the label, nor the date, nor the members.
checklistItemRoutes.put("/:id", (req, res) => {
  const existing = orNotFound(checklistItems.byId.get(req.params.id), ITEM_NOT_FOUND);
  const checklist = checklistOfItem(existing);
  openCard(checklist.card_id, req);

  const text = String(req.body.text ?? existing.text).trim();
  const done = req.body.done === undefined ? existing.done : (Number(Boolean(req.body.done)) as 0 | 1);
  const dueDate =
    req.body.due_date === undefined ? existing.due_date : parseDueDate(req.body.due_date);

  checklistItems.update.run(text, done, dueDate, existing.id);

  // Whoever is assigned to the item is notified, on screen and by e-mail; the
  // checklist-modification notification does not notify them on top of that.
  let attached: Id[] = [];
  if (Array.isArray(req.body.member_ids)) {
    const before = new Set(itemMemberIds(existing.id));
    replaceChecklistItemMembers(existing.id, toIds(req.body.member_ids));
    const card = taskCards.byId.get(checklist.card_id);
    if (card) {
      attached = notifyLinked({
        kind: "card",
        targetId: card.id,
        title: card.text,
        message: text
          ? `vous a ajouté à l'élément « ${text} » d'une checklist`
          : "vous a ajouté à un élément d'une checklist",
        recipients: itemMemberIds(existing.id).filter((id) => !before.has(id)),
        author: req.user,
        base: root(req),
      });
    }
  }

  editedCard(checklist.card_id, req, attached);

  // The response returns the whole checklist, so that the drawer updates
  // itself in one go.
  res.json(checklistWithItems(checklist));
});

checklistItemRoutes.delete("/:id", (req, res) => {
  const existing = orNotFound(checklistItems.byId.get(req.params.id), ITEM_NOT_FOUND);
  openCard(checklistOfItem(existing).card_id, req);

  checklistItems.remove.run(existing.id);

  deletionOnCard(
    checklistOfItem(existing).card_id,
    req,
    existing.text
      ? `a supprimé l'élément « ${existing.text} » d'une checklist`
      : "a supprimé un élément d'une checklist",
  );
  res.status(204).end();
});
