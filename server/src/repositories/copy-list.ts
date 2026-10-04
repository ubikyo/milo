// La copie d'une liste, avec tout ce qu'elle porte.
//
// Copier une liste ne se résume pas à recopier une ligne : la liste tient ses
// cartes, qui tiennent leurs membres, leurs étiquettes et leurs checklists,
// qui tiennent à leur tour leurs éléments et les membres de chacun. Sept
// tables, donc, parcourues une fois pour toutes ici plutôt qu'une requête par
// carte depuis la route.
//
// Ce qui ne se copie pas : le fil des cartes. Un commentaire porte un auteur
// et une date ; le recopier fabriquerait une conversation qui n'a pas eu lieu.
// La copie s'ouvre sur son propre mot de création, comme une carte neuve.
//
// Les pièces jointes, elles, suivent : ce sont des pièces au dossier, pas une
// conversation. Seules les lignes sont recopiées — les deux cartes citent le
// même fichier.

import type { Id } from "@milo/shared";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type {
  AttachmentRow,
  ChecklistItemRow,
  ChecklistRow,
  LabelRow,
  TaskCardRow,
} from "../db/rows.js";
import { now } from "../lib/time.js";
import { cardComments } from "./cards.js";
import { creationNote } from "./comments.js";
import { nextReference } from "./references.js";
import { boardContext, contexts } from "./contexts.js";
import { keyInBoard } from "./lists.js";
import { reorderTaskCards, taskCards, taskLists } from "./tasks.js";

// --- Lectures de la source -------------------------------------------------

const cardsOfList = selection<TaskCardRow>(
  "SELECT * FROM task_cards WHERE list_id = ? ORDER BY position, id",
);
const cardMembers = selection<{ user_id: Id }>(
  "SELECT user_id FROM card_members WHERE card_id = ?",
);
const cardLabels = selection<LabelRow>(
  `SELECT labels.*
   FROM card_labels
   JOIN labels ON labels.id = card_labels.label_id
   WHERE card_labels.card_id = ?
   ORDER BY labels.position, labels.id`,
);
const checklistsOfCard = selection<ChecklistRow>(
  "SELECT * FROM card_checklists WHERE card_id = ? ORDER BY position, id",
);
const checklistItems = selection<ChecklistItemRow>(
  "SELECT * FROM checklist_items WHERE checklist_id = ? ORDER BY position, id",
);
const itemMembers = selection<{ user_id: Id }>(
  "SELECT user_id FROM checklist_item_members WHERE item_id = ?",
);
const cardAttachments = selection<AttachmentRow>(
  "SELECT * FROM card_attachments WHERE card_id = ? ORDER BY position, id",
);

// --- Écritures de la copie -------------------------------------------------

const createList = mutation(
  `INSERT INTO task_lists (board_id, name, position, color, list_key, created_at)
   VALUES (?, ?, ?, ?, ?, ?)`,
);
// Ni l'une ni l'autre ne passe par `taskCards.create`, qui ne les prend pas :
// elles se posent juste après l'insertion.
const setDescription = mutation("UPDATE task_cards SET description = ? WHERE id = ?");
const setDue = mutation(
  `UPDATE task_cards SET due_date = ?, start_date = ?, due_form = ?, recurrence = ?, reminder = ?
   WHERE id = ?`,
);
const linkMember = mutation("INSERT OR IGNORE INTO card_members (card_id, user_id) VALUES (?, ?)");
const linkLabel = mutation(
  "INSERT OR IGNORE INTO card_labels (card_id, label_id) VALUES (?, ?)",
);
const createChecklist = mutation(
  "INSERT INTO card_checklists (card_id, title, position, created_at) VALUES (?, ?, ?, ?)",
);
const createItem = mutation(
  `INSERT INTO checklist_items (checklist_id, text, done, due_date, position, created_at)
   VALUES (?, ?, ?, ?, ?, ?)`,
);
const linkItemMember = mutation(
  "INSERT OR IGNORE INTO checklist_item_members (item_id, user_id) VALUES (?, ?)",
);
// La copie cite le même fichier que l'original : rien n'est recopié sur le
// disque, et le fichier ne s'en va qu'avec la dernière ligne qui le cite
// (repositories/attachments.ts).
// Les couvertures se recopient de même, dans leur ordre.
const setRotation = mutation("UPDATE task_cards SET cover_interval = ? WHERE id = ?");
const carryCovers = mutation(
  `INSERT INTO card_covers (card_id, file, name, size, position, created_at)
   SELECT ?, file, name, size, position, ? FROM card_covers WHERE card_id = ?`,
);
const carryAttachment = mutation(
  `INSERT INTO card_attachments (card_id, file, name, mime, size, user_id, created_at, position)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
);

// --- Étiquettes d'un tableau à l'autre --------------------------------------
// Une étiquette appartient à son tableau. Copier vers un autre tableau ne peut
// donc pas reprendre le lien tel quel : on cherche là-bas la même étiquette,
// au nom et à la couleur, et on la crée si elle manque. Sans cela, les cartes
// arriveraient nues et on ne saurait plus ce qu'elles portaient.

const twinLabel = selection<LabelRow>(
  `SELECT * FROM labels
   WHERE board_id = ? AND name = ? COLLATE NOCASE AND color = ?
   ORDER BY position, id`,
);
const nextLabelRank = scalar<{ next: number }>(
  "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM labels WHERE board_id = ?",
);
const createLabel = mutation(
  "INSERT INTO labels (board_id, name, color, position, created_at) VALUES (?, ?, ?, ?, ?)",
);

/**
 * L'étiquette du tableau d'accueil qui correspond à celle-ci. Dans le tableau
 * d'origine, c'est elle-même ; ailleurs, sa jumelle, créée au besoin.
 */
const matchingLabel = (
  label: LabelRow,
  targetBoard: Id,
  cache: Map<Id, Id>,
  timestamp: string,
): Id => {
  if (label.board_id === targetBoard) return label.id;

  const already = cache.get(label.id);
  if (already !== undefined) return already;

  const twin = twinLabel.get(targetBoard, label.name, label.color);
  const id =
    twin?.id ??
    Number(
      createLabel.run(
        targetBoard,
        label.name,
        label.color,
        nextLabelRank(targetBoard).next,
        timestamp,
      ).lastInsertRowid,
    );

  cache.set(label.id, id);
  return id;
};

// --- Une carte --------------------------------------------------------------

/** Où va la copie d'une carte, et ce qui l'accompagne. */
interface CardCopy {
  listId: Id;
  rank: number;
  /** Le tableau de la liste d'accueil : il tient les étiquettes. */
  boardId: Id;
  text: string;
  userId: Id;
  timestamp: string;
  /** Les étiquettes déjà appariées d'un tableau à l'autre. */
  labels: Map<Id, Id>;
}

/** Recopie une carte et tout ce qu'elle porte ; rend l'identifiant de la copie. */
const copyCard = (card: TaskCardRow, copy: CardCopy): Id => {
  const { listId, rank, boardId, text, userId, timestamp, labels } = copy;
  const separator = card.kind === "separator";

  // La référence n'est pas celle de l'original : deux cartes ne peuvent pas
  // porter le même repère. Un séparateur n'en a pas.
  const phoneNumber = separator ? 0 : nextReference();
  const cardId = Number(
    taskCards.create
      .run(
        listId,
        text,
        rank,
        phoneNumber,
        card.kind,
        // Dans son tableau, la copie garde le contexte de l'original ; ailleurs,
        // elle prend le premier du tableau d'accueil.
        boardContext(
          boardId,
          undefined,
          contexts.byId.get(card.context_id)?.board_id === boardId ? card.context_id : null,
        ),
        timestamp,
      ).lastInsertRowid,
  );

  if (card.description) setDescription.run(card.description, cardId);
  // L'échéance suit la carte : une copie a la même date à tenir.
  if (card.due_date) {
    setDue.run(
      card.due_date,
      card.start_date,
      card.due_form,
      card.recurrence,
      card.reminder,
      cardId,
    );
  }
  setRotation.run(card.cover_interval, cardId);

  for (const { user_id } of cardMembers.all(card.id)) {
    linkMember.run(cardId, user_id);
  }

  for (const label of cardLabels.all(card.id)) {
    linkLabel.run(cardId, matchingLabel(label, boardId, labels, timestamp));
  }

  carryCovers.run(cardId, timestamp, card.id);

  for (const attachment of cardAttachments.all(card.id)) {
    carryAttachment.run(
      cardId,
      attachment.file,
      attachment.name,
      attachment.mime,
      attachment.size,
      // La copie est déposée par celui qui copie, maintenant : c'est lui qui
      // l'apporte dans cette liste-ci.
      userId,
      timestamp,
      attachment.position,
    );
  }

  for (const checklist of checklistsOfCard.all(card.id)) {
    const checklistId = Number(
      createChecklist.run(cardId, checklist.title, checklist.position, timestamp)
        .lastInsertRowid,
    );

    for (const element of checklistItems.all(checklist.id)) {
      const itemId = Number(
        createItem.run(
          checklistId,
          element.text,
          element.done,
          element.due_date,
          element.position,
          timestamp,
        ).lastInsertRowid,
      );
      for (const { user_id } of itemMembers.all(element.id)) {
        linkItemMember.run(itemId, user_id);
      }
    }
  }

  // Le fil s'ouvre comme celui de n'importe quelle carte neuve : la copie a
  // bien été créée maintenant. Un séparateur n'a pas de fiche, donc pas de
  // fil.
  if (!separator) {
    cardComments.createSystem.run(
      cardId,
      null,
      creationNote("Carte créée", timestamp, userId),
      timestamp,
      timestamp,
    );
  }

  return cardId;
};

// --- La copie ---------------------------------------------------------------

export interface ListCopy {
  /** La liste d'origine. */
  sourceId: Id;
  /** Le tableau d'accueil ; ce peut être celui de la liste d'origine. */
  boardId: Id;
  /** Le nom de la copie. */
  name: string;
  /** La couleur de la liste d'origine, que la copie reprend. */
  color: string;
  /** Qui copie : c'est l'auteur du mot qui ouvre le fil de chaque carte. */
  userId: Id;
}

/**
 * Copie la liste et rend l'identifiant de la copie. Tout passe ou rien : une
 * erreur au milieu ne doit pas laisser une liste à moitié garnie.
 */
export const copyTaskList = transaction((copy: ListCopy): Id => {
  const { sourceId, boardId, name, color, userId } = copy;
  const timestamp = now();

  // La copie se range à la fin du tableau d'accueil, comme une liste qu'on
  // viendrait d'y créer — y compris quand c'est le tableau d'origine.
  const { next } = taskLists.nextPosition(boardId);
  // Dans son tableau, la copie reste dans le widget de l'original ; ailleurs,
  // elle va au premier widget « Tâches » du tableau d'accueil.
  const source = taskLists.byId.get(sourceId);
  const key = keyInBoard(
    boardId,
    "task.list",
    source?.board_id === boardId ? source.list_key : undefined,
  );
  const listId = Number(
    createList.run(boardId, name, next, color, key, timestamp).lastInsertRowid,
  );

  // Les étiquettes déjà appariées d'un tableau à l'autre, pour ne les chercher
  // — et ne les créer — qu'une fois par liste copiée.
  const labels = new Map<Id, Id>();

  for (const [rank, card] of cardsOfList.all(sourceId).entries()) {
    copyCard(card, { listId, rank, boardId, text: card.text, userId, timestamp, labels });
  }

  return listId;
});

/**
 * Duplique une carte dans sa propre liste, juste après l'original, et rend
 * l'identifiant de la copie : une base pour une carte voisine.
 */
export const duplicateTaskCard = transaction((cardId: Id, userId: Id): Id => {
  const card = taskCards.byId.get(cardId);
  if (!card) throw new Error(`Carte ${cardId} introuvable`);
  const list = taskLists.byId.get(card.list_id);
  if (!list) throw new Error(`Carte ${cardId} sans liste`);

  const separator = card.kind === "separator";
  const copyId = copyCard(card, {
    listId: list.id,
    rank: taskCards.nextPosition(list.id).next,
    boardId: list.board_id,
    // Un séparateur tranche toujours au même endroit : son libellé reste.
    text: separator ? card.text : `${card.text} (copie)`,
    userId,
    timestamp: now(),
    labels: new Map(),
  });

  // La copie se range juste sous l'original, pas au bout de la liste.
  const order = cardsOfList
    .all(list.id)
    .map((c) => c.id)
    .filter((id) => id !== copyId);
  order.splice(order.indexOf(card.id) + 1, 0, copyId);
  reorderTaskCards(list.id, order);

  return copyId;
});
