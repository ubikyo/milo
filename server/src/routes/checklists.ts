// Les checklists d'une carte et leurs éléments. Tout s'enregistre au fil des
// gestes, sans attendre « Enregistrer », et tout part avec la carte
// (ON DELETE CASCADE).

import { Router } from "express";
import type { Request } from "express";
import { badRequest, orNotFound, requireText, toIds } from "../lib/http.js";
import { notifier, racine } from "../lib/notify.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { boardOuvert } from "../repositories/boards.js";
import {
  checklistItems,
  checklistOfItem,
  checklistWithItems,
  checklists,
  checklistsOfCard,
  itemsOfChecklist,
  reorderChecklistItems,
  reorderChecklists,
  replaceChecklistItemMembers,
} from "../repositories/cards.js";
import { boardOfCard, taskCards } from "../repositories/tasks.js";

const CHECKLIST_INTROUVABLE = "Checklist introuvable";
const ELEMENT_INTROUVABLE = "Élément introuvable";
const CARTE_INTROUVABLE = "Carte introuvable";

/**
 * Une date d'échéance s'écrit « AAAA-MM-JJ », comme les sélecteurs de Mantine
 * la produisent. Tout le reste vaut « pas de date » plutôt qu'une erreur : le
 * champ est facultatif.
 */
const dateEcheance = (valeur: unknown): string =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(valeur ?? "")) ? String(valeur) : "";

const carteOuverte = (id: unknown, user: Express.Request["user"]) => {
  const card = orNotFound(taskCards.byId.get(id), CARTE_INTROUVABLE);
  boardOuvert(boardOfCard(card), user);
  return card;
};

const checklistOuverte = (id: unknown, user: Express.Request["user"]) => {
  const checklist = orNotFound(checklists.byId.get(id), CHECKLIST_INTROUVABLE);
  carteOuverte(checklist.card_id, user);
  return checklist;
};

/**
 * Une checklist a changé : c'est la carte qui la porte que l'on suit, et c'est
 * elle que la notification nomme. Les réordonnancements n'appellent pas cette
 * fonction — glisser un élément ne change pas ce que la checklist dit.
 */
const carteModifiee = (cardId: unknown, req: Request): void => {
  const carte = taskCards.byId.get(cardId);
  if (!carte) return;
  notifier({
    kind: "card",
    targetId: carte.id,
    titre: carte.text,
    message: "a modifié une checklist",
    auteur: req.user,
    base: racine(req),
  });
};

/** Monté sous `/api/task-cards/:id/checklists`. */
export const cardChecklistRoutes = Router({ mergeParams: true });

cardChecklistRoutes.use(touch("task-lists"));

cardChecklistRoutes.post("/", (req, res) => {
  const { id } = req.params as { id?: string };
  const card = carteOuverte(id, req.user);
  const title = String(req.body.title ?? "Checklist").trim() || "Checklist";

  const { next } = checklists.nextPosition(card.id);
  const { lastInsertRowid } = checklists.create.run(card.id, title, next, now());

  carteModifiee(card.id, req);
  res.status(201).json({ ...checklists.byId.get(lastInsertRowid), items: [] });
});

// L'ordre reçu est celui, complet, des checklists de la carte.
cardChecklistRoutes.put("/reorder", (req, res) => {
  const { id } = req.params as { id?: string };
  const card = carteOuverte(id, req.user);
  const { ids } = req.body;
  if (!Array.isArray(ids)) badRequest("ids doit être un tableau");

  const ordre = toIds(ids);
  const connues = new Set(checklists.idsOfCard.all(card.id).map((c) => c.id));
  // Une checklist ne se glisse qu'à l'intérieur de sa carte, et l'ordre reçu
  // doit toutes les couvrir : sinon les omises garderaient une position
  // devenue fausse.
  if (ordre.length !== connues.size || ordre.some((id) => !connues.has(id))) {
    badRequest("L'ordre reçu ne couvre pas les checklists de cette carte");
  }

  reorderChecklists(card.id, ordre);
  res.json(checklistsOfCard(card.id));
});

/** Monté sous `/api/checklists`. */
export const checklistRoutes = Router();

checklistRoutes.use(touch("task-lists"));

checklistRoutes.put("/:id", (req, res) => {
  const checklist = checklistOuverte(req.params.id, req.user);
  const title = requireText(
    req.body.title ?? checklist.title,
    "Le titre de la checklist est requis",
  );

  checklists.rename.run(title, checklist.id);

  carteModifiee(checklist.card_id, req);
  res.json(checklistWithItems(checklists.byId.get(checklist.id)!));
});

checklistRoutes.delete("/:id", (req, res) => {
  const checklist = checklistOuverte(req.params.id, req.user);
  checklists.remove.run(checklist.id);

  carteModifiee(checklist.card_id, req);
  res.status(204).end();
});

// Un élément naît en bas de sa checklist, sans libellé : on le saisit ensuite
// sur place.
checklistRoutes.post("/:id/items", (req, res) => {
  const checklist = checklistOuverte(req.params.id, req.user);
  const text = String(req.body.text ?? "").trim();

  const { next } = checklistItems.nextPosition(checklist.id);
  const { lastInsertRowid } = checklistItems.create.run(checklist.id, text, next, now());

  carteModifiee(checklist.card_id, req);
  res.status(201).json({ ...checklistItems.byId.get(lastInsertRowid), members: [] });
});

// L'ordre reçu est celui, complet, des éléments de la checklist.
checklistRoutes.put("/:id/items/reorder", (req, res) => {
  const checklist = checklistOuverte(req.params.id, req.user);
  const { ids } = req.body;
  if (!Array.isArray(ids)) badRequest("ids doit être un tableau");

  const ordre = toIds(ids);
  const connus = new Set(checklistItems.idsOfChecklist.all(checklist.id).map((i) => i.id));
  // Un élément ne se glisse qu'à l'intérieur de sa propre checklist, et
  // l'ordre reçu doit tous les couvrir : sinon les omis garderaient une
  // position devenue fausse.
  if (ordre.length !== connus.size || ordre.some((id) => !connus.has(id))) {
    badRequest("L'ordre reçu ne couvre pas les éléments de cette checklist");
  }

  reorderChecklistItems(checklist.id, ordre);
  res.json({ ...checklist, items: itemsOfChecklist(checklist.id) });
});

/** Monté sous `/api/checklist-items`. */
export const checklistItemRoutes = Router();

checklistItemRoutes.use(touch("task-lists"));

// Chaque champ absent du corps reste tel quel : cocher une case n'efface ni le
// libellé, ni la date, ni les membres.
checklistItemRoutes.put("/:id", (req, res) => {
  const existing = orNotFound(checklistItems.byId.get(req.params.id), ELEMENT_INTROUVABLE);
  const checklist = checklistOfItem(existing);
  carteOuverte(checklist.card_id, req.user);

  const text = String(req.body.text ?? existing.text).trim();
  const done = req.body.done === undefined ? existing.done : (Number(Boolean(req.body.done)) as 0 | 1);
  const dueDate =
    req.body.due_date === undefined ? existing.due_date : dateEcheance(req.body.due_date);

  checklistItems.update.run(text, done, dueDate, existing.id);

  if (Array.isArray(req.body.member_ids)) {
    replaceChecklistItemMembers(existing.id, toIds(req.body.member_ids));
  }

  carteModifiee(checklist.card_id, req);

  // La réponse renvoie la checklist entière, pour que le tiroir se remette à
  // jour d'un bloc.
  res.json(checklistWithItems(checklist));
});

checklistItemRoutes.delete("/:id", (req, res) => {
  const existing = orNotFound(checklistItems.byId.get(req.params.id), ELEMENT_INTROUVABLE);
  carteOuverte(checklistOfItem(existing).card_id, req.user);

  checklistItems.remove.run(existing.id);

  carteModifiee(checklistOfItem(existing).card_id, req);
  res.status(204).end();
});
