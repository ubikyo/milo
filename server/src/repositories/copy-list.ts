// Copying a list, with everything it carries.
//
// Copying a list is more than copying a row: the list holds its cards, which
// hold their members, labels and checklists, which in turn hold their items
// and each one's members. Seven tables, then, walked once and for all here
// rather than one query per card from the route.
//
// What is not copied: the cards' thread. A comment carries an author and a
// date; copying it would fabricate a conversation that did not take place.
// The copy opens with its own creation note, like a new card.
//
// Attachments, however, follow: they are documents on file, not a
// conversation. Only the rows are copied — both cards cite the same file.

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

// --- Reads from the source ------------------------------------------------

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

// --- Writes of the copy ----------------------------------------------------

const createList = mutation(
  `INSERT INTO task_lists (board_id, name, position, color, list_key, created_at)
   VALUES (?, ?, ?, ?, ?, ?)`,
);
// Neither goes through `taskCards.create`, which does not take them: they are
// set right after the insertion.
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
// The copy cites the same file as the original: nothing is copied on disk,
// and the file goes away only with the last row citing it
// (repositories/attachments.ts).
// Covers are copied the same way, in their order.
const setRotation = mutation("UPDATE task_cards SET cover_interval = ? WHERE id = ?");
const carryCovers = mutation(
  `INSERT INTO card_covers (card_id, file, name, size, position, created_at)
   SELECT ?, file, name, size, position, ? FROM card_covers WHERE card_id = ?`,
);
const carryAttachment = mutation(
  `INSERT INTO card_attachments (card_id, file, name, mime, size, user_id, created_at, position)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
);

// --- Labels from one board to another ---------------------------------------
// A label belongs to its board. Copying to another board therefore cannot take
// the link as is: we look there for the same label, by name and color, and
// create it if it is missing. Without this, cards would arrive bare and we
// would no longer know what they carried.

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
 * The destination board's label that matches this one. In the source board,
 * it is itself; elsewhere, its twin, created if needed.
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

// --- A card -----------------------------------------------------------------

/** Where a card's copy goes, and what accompanies it. */
interface CardCopy {
  listId: Id;
  rank: number;
  /** The destination list's board: it holds the labels. */
  boardId: Id;
  text: string;
  userId: Id;
  timestamp: string;
  /** Labels already matched from one board to another. */
  labels: Map<Id, Id>;
}

/** Copies a card and everything it carries; returns the copy's identifier. */
const copyCard = (card: TaskCardRow, copy: CardCopy): Id => {
  const { listId, rank, boardId, text, userId, timestamp, labels } = copy;
  const separator = card.kind === "separator";

  // The reference is not the original's: two cards cannot carry the same
  // marker. A separator has none.
  const phoneNumber = separator ? 0 : nextReference();
  const cardId = Number(
    taskCards.create
      .run(
        listId,
        text,
        rank,
        phoneNumber,
        card.kind,
        // Within its board, the copy keeps the original's context; elsewhere,
        // it takes the destination board's first.
        boardContext(
          boardId,
          undefined,
          contexts.byId.get(card.context_id)?.board_id === boardId ? card.context_id : null,
        ),
        timestamp,
      ).lastInsertRowid,
  );

  if (card.description) setDescription.run(card.description, cardId);
  // The due date follows the card: a copy has the same date to meet.
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
      // The copy is dropped by whoever copies, now: they are the one bringing
      // it into this list.
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

  // The thread opens like that of any new card: the copy was indeed created
  // now. A separator has no sheet, hence no thread.
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

// --- The copy ---------------------------------------------------------------

export interface ListCopy {
  /** The source list. */
  sourceId: Id;
  /** The destination board; it may be the source list's board. */
  boardId: Id;
  /** The copy's name. */
  name: string;
  /** The source list's color, which the copy takes over. */
  color: string;
  /** Who copies: they are the author of the note that opens each card's thread. */
  userId: Id;
}

/**
 * Copies the list and returns the copy's identifier. Everything passes or
 * nothing: an error in the middle must not leave a half-filled list.
 */
export const copyTaskList = transaction((copy: ListCopy): Id => {
  const { sourceId, boardId, name, color, userId } = copy;
  const timestamp = now();

  // The copy is placed at the end of the destination board, like a list just
  // created there — including when it is the source board.
  const { next } = taskLists.nextPosition(boardId);
  // Within its board, the copy stays in the original's widget; elsewhere,
  // it goes to the destination board's first "Tâches" widget.
  const source = taskLists.byId.get(sourceId);
  const key = keyInBoard(
    boardId,
    "task.list",
    source?.board_id === boardId ? source.list_key : undefined,
  );
  const listId = Number(
    createList.run(boardId, name, next, color, key, timestamp).lastInsertRowid,
  );

  // Labels already matched from one board to another, so as to look them up
  // — and create them — only once per copied list.
  const labels = new Map<Id, Id>();

  for (const [rank, card] of cardsOfList.all(sourceId).entries()) {
    copyCard(card, { listId, rank, boardId, text: card.text, userId, timestamp, labels });
  }

  return listId;
});

/**
 * Duplicates a card in its own list, right after the original, and returns
 * the copy's identifier: a basis for a neighboring card.
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
    // A separator always splits in the same place: its label stays.
    text: separator ? card.text : `${card.text} (copie)`,
    userId,
    timestamp: now(),
    labels: new Map(),
  });

  // The copy is placed right under the original, not at the end of the list.
  const order = cardsOfList
    .all(list.id)
    .map((c) => c.id)
    .filter((id) => id !== copyId);
  order.splice(order.indexOf(card.id) + 1, 0, copyId);
  reorderTaskCards(list.id, order);

  return copyId;
});
