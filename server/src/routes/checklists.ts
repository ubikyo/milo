// Les checklists d'une carte et leurs éléments. Tout s'enregistre au fil des
// gestes, sans attendre « Enregistrer », et tout part avec la carte
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
 * Une date d'échéance s'écrit « AAAA-MM-JJ », comme les sélecteurs de Mantine
 * la produisent. Tout le reste vaut « pas de date » plutôt qu'une erreur : le
 * champ est facultatif.
 */
const parseDueDate = (value: unknown): string =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "")) ? String(value) : "";

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

const openChecklist = (id: unknown, req: Request) => {
  const checklist = orNotFound(checklists.byId.get(id), CHECKLIST_NOT_FOUND);
  openCard(checklist.card_id, req);
  return checklist;
};

/**
 * Une checklist a changé : c'est la carte qui la porte que l'on suit, et c'est
 * elle que la notification nomme. Les réordonnancements n'appellent pas cette
 * fonction — glisser un élément ne change pas ce que la checklist dit.
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

/** Une checklist ou l'un de ses éléments supprimé : ceux qui suivent la carte le savent. */
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

/** Monté sous `/api/task-cards/:id/checklists`. */
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

// L'ordre reçu est celui, complet, des checklists de la carte.
cardChecklistRoutes.put("/reorder", (req, res) => {
  const { id } = req.params as { id?: string };
  const card = openCard(id, req);
  const { ids } = req.body;
  if (!Array.isArray(ids)) badRequest("ids doit être un tableau");

  const order = toIds(ids);
  const known = new Set(checklists.idsOfCard.all(card.id).map((c) => c.id));
  // Une checklist ne se glisse qu'à l'intérieur de sa carte, et l'ordre reçu
  // doit toutes les couvrir : sinon les omises garderaient une position
  // devenue fausse.
  if (order.length !== known.size || order.some((id) => !known.has(id))) {
    badRequest("L'ordre reçu ne couvre pas les checklists de cette carte");
  }

  reorderChecklists(card.id, order);
  editedCard(card.id, req);
  res.json(checklistsOfCard(card.id));
});

/** Monté sous `/api/checklists`. */
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

// Un élément naît en bas de sa checklist, sans libellé : on le saisit ensuite
// sur place.
checklistRoutes.post("/:id/items", (req, res) => {
  const checklist = openChecklist(req.params.id, req);
  const text = String(req.body.text ?? "").trim();

  const { next } = checklistItems.nextPosition(checklist.id);
  const { lastInsertRowid } = checklistItems.create.run(checklist.id, text, next, now());

  editedCard(checklist.card_id, req);
  res.status(201).json({ ...checklistItems.byId.get(lastInsertRowid), members: [] });
});

// L'ordre reçu est celui, complet, des éléments de la checklist.
checklistRoutes.put("/:id/items/reorder", (req, res) => {
  const checklist = openChecklist(req.params.id, req);
  const { ids } = req.body;
  if (!Array.isArray(ids)) badRequest("ids doit être un tableau");

  const order = toIds(ids);
  const known = new Set(checklistItems.idsOfChecklist.all(checklist.id).map((i) => i.id));
  // Un élément ne se glisse qu'à l'intérieur de sa propre checklist, et
  // l'ordre reçu doit tous les couvrir : sinon les omis garderaient une
  // position devenue fausse.
  if (order.length !== known.size || order.some((id) => !known.has(id))) {
    badRequest("L'ordre reçu ne couvre pas les éléments de cette checklist");
  }

  reorderChecklistItems(checklist.id, order);
  editedCard(checklist.card_id, req);
  res.json({ ...checklist, items: itemsOfChecklist(checklist.id) });
});

/** Monté sous `/api/checklist-items`. */
export const checklistItemRoutes = Router();

checklistItemRoutes.use(touch("task-lists"));

// Chaque champ absent du corps reste tel quel : cocher une case n'efface ni le
// libellé, ni la date, ni les membres.
checklistItemRoutes.put("/:id", (req, res) => {
  const existing = orNotFound(checklistItems.byId.get(req.params.id), ITEM_NOT_FOUND);
  const checklist = checklistOfItem(existing);
  openCard(checklist.card_id, req);

  const text = String(req.body.text ?? existing.text).trim();
  const done = req.body.done === undefined ? existing.done : (Number(Boolean(req.body.done)) as 0 | 1);
  const dueDate =
    req.body.due_date === undefined ? existing.due_date : parseDueDate(req.body.due_date);

  checklistItems.update.run(text, done, dueDate, existing.id);

  // Qui arrive sur l'élément en est prévenu, à l'écran et par e-mail ; la
  // notification de modification de la checklist ne le prévient pas en plus.
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

  // La réponse renvoie la checklist entière, pour que le tiroir se remette à
  // jour d'un bloc.
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
