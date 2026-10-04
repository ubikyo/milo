// Les cartes d'une liste : création, texte, déplacement, et la fiche complète
// avec ses membres, ses étiquettes et son fil.

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

/** Ce que le fil note d'une carte quand sa fiche change (lib/historique.ts). */
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

/** Le libellé d'une récurrence ou d'un rappel, pour le fil. */
const labelOf = (
  options: readonly { value: string; label: string }[],
  value: string,
): string => options.find((o) => o.value === value)?.label ?? "—";

/** Le début d'une période : « AAAA-MM-JJ », ou vide. Absent, il reste tel quel. */
const start = (value: unknown, current: string): string => {
  if (value === undefined) return current;
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) badRequest("Date de début invalide");
  return text;
};

/** Une valeur d'une liste fermée. Absente, elle reste telle quelle. */
const choice = <T extends string>(value: unknown, current: T, isValid: (v: unknown) => v is T): T => {
  if (value === undefined) return current;
  const text: unknown = value ?? "";
  if (isValid(text)) return text;
  return badRequest("Valeur inconnue");
};

/** Un nombre d'une liste fermée. Absent, il reste tel quel. */
const numberChoice = (value: unknown, current: number, isValid: (v: unknown) => v is number): number => {
  if (value === undefined) return current;
  if (isValid(value)) return value;
  return badRequest("Valeur inconnue");
};

export const taskCardRoutes = Router();

taskCardRoutes.use(touch("task-lists"));

/**
 * La carte visée, si son tableau est ouvert à cette personne — avec `droit`
 * en plus dans sa société quand on y écrit. Son fil se lit avec elle, et y
 * écrire est la modifier.
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
  // Le contexte qu'on dit, à défaut le premier du tableau.
  const context = boardContext(list.board_id, req.body.context_id);

  // Nouvelle carte ajoutée à la fin de sa liste.
  const { next } = taskCards.nextPosition(list.id);

  const timestamp = now();
  const { lastInsertRowid } = taskCards.create.run(
    list.id,
    text,
    next,
    // Un séparateur ne porte pas de référence, et n'en consomme donc pas.
    kind === "separator" ? 0 : nextReference(),
    kind,
    context,
    timestamp,
  );

  // Une carte créée depuis un autre mode (« Créer une tâche ») arrive avec sa
  // description : le lien vers l'élément d'où elle vient. Un séparateur n'a
  // pas de fiche, il n'en reçoit pas.
  const description = kind === "separator" ? "" : cleanDescription(req.body.description ?? "");
  if (description) taskCards.describe.run(description, lastInsertRowid);

  // Le fil d'une carte s'ouvre sur sa création. Un séparateur n'a pas de
  // fiche, donc pas de fil.
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
  // Suivre une liste, c'est suivre ses cartes : une carte de plus dans la
  // liste est une modification de ce qu'elle contient. Un séparateur, non :
  // il n'a pas de fiche, et rien à ouvrir.
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
 * Dupliquer une carte : la copie, avec tout ce qu'elle porte, se pose juste
 * sous l'original, dans la même liste (repositories/copy-list.ts). On la
 * reprend ensuite comme base d'une autre.
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

// Déplacement dans la liste ou d'une liste vers une autre. Déclaré avant
// « /:id », sinon « reorder » serait interprété comme un identifiant.
// L'ordre reçu est celui, complet, de la liste d'accueil : les cartes venues
// d'une autre liste y sont rattachées au passage.
taskCardRoutes.put("/reorder", (req, res) => {
  const { list_id, ids } = req.body;
  if (!Array.isArray(ids)) badRequest("ids doit être un tableau");
  const list = orNotFound(list_id ? taskLists.byId.get(list_id) : undefined, "Liste introuvable");
  openTaskBoard(list.board_id, req, "update");

  const order = toIds(ids);

  // Une carte ne se déplace qu'entre les listes d'un même tableau.
  const known = new Set(taskCards.idsOfBoard.all(list.board_id).map((c) => c.id));
  if (order.some((id) => !known.has(id))) {
    badRequest("Une carte n'appartient pas à ce tableau");
  }

  // Un contexte choisi cache les cartes des autres : l'ordre reçu ne nomme
  // que celles qu'on voit. Elles reprennent, dans leur nouvel ordre, les
  // places qu'elles tenaient ; les cartes cachées gardent la leur, et celles
  // venues d'une autre liste se rangent à la suite.
  const received = new Set(order);
  const remaining = [...order];
  const full = taskCards.idsOfList
    .all(list.id)
    .map((c) => (received.has(c.id) ? (remaining.shift() ?? c.id) : c.id));
  const fullOrder = [...full, ...remaining];

  // D'où vient chaque carte, avant que l'écriture ne l'efface. Glisser une
  // carte dans sa propre liste ne change rien à ce qu'elle dit et ne notifie
  // personne ; la faire passer de « À faire » à « Terminé », si.
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
 * Où se trouve cette carte : sa liste, son tableau, sa vue. Sert au lien
 * qui l'ouvre — l'application doit se placer sur le bon tableau avant de
 * pouvoir montrer la fiche, et le client ne peut pas le deviner d'une carte
 * qu'il n'affiche pas encore.
 */
taskCardRoutes.get("/:id/location", (req, res) => {
  const card = openCard(req.params.id, req);
  const list = orNotFound(taskLists.byId.get(card.list_id), "Liste introuvable");
  const board = orNotFound(boards.byId.get(list.board_id), "Tableau introuvable");

  res.json({ view_id: board.view_id, board_id: board.id, list_id: list.id });
});

// Modification d'une carte : son texte seul depuis le tableau, sa fiche
// entière depuis son tiroir. Chaque champ absent du corps reste tel quel.
taskCardRoutes.put("/:id", (req, res) => {
  const existing = openCard(req.params.id, req, "update");
  const text = requireText(req.body.text ?? existing.text, "Le texte de la carte est requis");
  const description = cleanDescription(req.body.description ?? existing.description ?? "");
  const dueDate = due(req.body.due_date, existing.due_date);
  // Sans échéance, ni début, ni récurrence, ni rappel : ils n'ont rien à quoi
  // se rapporter.
  const shape = dueDate ? choice(req.body.due_form, existing.due_form, isDueForm) : "date";
  // Une date seule n'a pas de début.
  const startDate =
    dueDate && shape === "period" ? start(req.body.start_date, existing.start_date) : "";
  const recurrence = dueDate ? choice(req.body.recurrence, existing.recurrence, isRecurrence) : "";
  const reminder = dueDate ? choice(req.body.reminder, existing.reminder, isReminder) : "";
  // Un séparateur n'a pas de fiche, donc pas de fil où noter ce qui change.
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
  // Prévenir vient après l'écriture, jamais avant : on ne notifie que ce qui
  // est enregistré. Les suiveurs de la liste et les membres de la carte sont
  // prévenus au même titre que ceux qui la suivent (lib/notify.ts). Une fiche
  // enregistrée sans changement ne note rien et ne prévient personne.
  const rows = before ? changes(before, photo(next.id)) : [];
  // Les nouveaux acteurs ont leur propre notification, à l'écran et par
  // e-mail ; celle de la modification ne les prévient pas une seconde fois.
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

// Suppression d'une carte ou d'un séparateur : ses membres, étiquettes,
// checklists, pièces jointes et commentaires partent avec elle.
taskCardRoutes.delete("/:id", (req, res) => {
  const existing = openCard(req.params.id, req, "delete");
  // Un séparateur n'est suivi par personne pour lui-même : il n'a pas de
  // fiche. Sa disparition ne s'annonce pas.
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

// --- Fil d'une carte -------------------------------------------------------

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

/** Monté sous `/api/card-comments`. */
export const cardCommentRoutes = Router();

cardCommentRoutes.use(touch("task-lists"));

cardCommentRoutes.put("/:id", (req, res) => {
  const comment = orNotFound(cardComments.byId.get(req.params.id), COMMENT_NOT_FOUND);
  if (comment.system) forbidden(SYSTEM_COMMENT);
  openCard(comment.card_id, req, "update");
  const text = requireText(req.body.text, "text est requis");

  // Un texte identique n'est pas une modification : la date ne bouge pas, et
  // le commentaire ne se met pas à porter « (modifié) ».
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
