// The lists of a board and their cards: what the Task mode reads in one go.

import type { Actor, Id, Label, OpenChecklistItem, TaskCard, TaskList } from "@milo/shared";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type { LabelRow, NextRow, TaskCardRow, TaskListRow } from "../db/rows.js";
import { hasContent } from "../lib/html.js";
import { attachmentCountsOfBoard } from "./attachments.js";
import { coverUrlsOfBoard } from "./covers.js";
import { linkCountsOfBoard } from "./links.js";
import { listScope, nextCardReference } from "./references.js";
import { actorOf } from "./users.js";

export const taskLists = {
  byId: selection<TaskListRow>("SELECT * FROM task_lists WHERE id = ?"),
  ofBoard: selection<TaskListRow>(
    "SELECT * FROM task_lists WHERE board_id = ? ORDER BY position, id",
  ),
  idsOfBoard: selection<{ id: Id }>("SELECT id FROM task_lists WHERE board_id = ?"),
  nextPosition: scalar<NextRow>(
    "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM task_lists WHERE board_id = ?",
  ),
  create: mutation(
    `INSERT INTO task_lists (board_id, name, position, list_key, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ),
  update: mutation(
    `UPDATE task_lists SET board_id = ?, name = ?, position = ?, color = ?, list_key = ?
     WHERE id = ?`,
  ),
  remove: mutation("DELETE FROM task_lists WHERE id = ?"),
};

export const taskCards = {
  byId: selection<TaskCardRow>("SELECT * FROM task_cards WHERE id = ?"),
  idsOfList: selection<{ id: Id }>(
    "SELECT id FROM task_cards WHERE list_id = ? ORDER BY position, id",
  ),
  nextPosition: scalar<NextRow>(
    "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM task_cards WHERE list_id = ?",
  ),
  create: mutation(
    `INSERT INTO task_cards (list_id, text, position, number, kind, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ),
  update: mutation(
    `UPDATE task_cards
     SET text = @text, description = @description, due_date = @due_date,
         start_date = @start_date, due_form = @due_form, recurrence = @recurrence, reminder = @reminder,
         cover_interval = @cover_interval,
         -- Une échéance ou un rappel qui change rouvre le rappel.
         reminded_for = CASE WHEN due_date = @due_date AND reminder = @reminder
                             THEN reminded_for ELSE '' END
     WHERE id = @id`,
  ),
  /** The description alone: the one a card gets as soon as it is created. */
  describe: mutation("UPDATE task_cards SET description = ? WHERE id = ?"),
  remove: mutation("DELETE FROM task_cards WHERE id = ?"),
  /** Emptying a list of its tasks: its separators stay in place. */
  removeTasksOfList: mutation("DELETE FROM task_cards WHERE list_id = ? AND kind = 'card'"),
  /** Emptying a list of all its cards, separators included. */
  removeCardsOfList: mutation("DELETE FROM task_cards WHERE list_id = ?"),
  /** The cards of a board, as ids: a card only moves within its own board. */
  idsOfBoard: selection<{ id: Id }>(
    `SELECT task_cards.id
     FROM task_cards
     JOIN task_lists ON task_lists.id = task_cards.list_id
     WHERE task_lists.board_id = ?`,
  ),
};

const updateListPositions = mutation("UPDATE task_lists SET position = ? WHERE id = ?");
export const reorderTaskLists = transaction((ids: Id[]) => {
  ids.forEach((id, index) => updateListPositions.run(index, id));
});

const updateCardPositions = mutation("UPDATE task_cards SET list_id = ?, position = ? WHERE id = ?");
const setCardNumber = mutation("UPDATE task_cards SET number = ? WHERE id = ?");

/**
 * The cards of a list, in order. A card arriving from another widget takes
 * the next number of this one — read before it moves in, so that its old
 * number does not count.
 */
export const reorderTaskCards = transaction((listId: Id, ids: Id[]) => {
  const scope = listScope(listId);
  ids.forEach((id, index) => {
    const card = taskCards.byId.get(id);
    const arriving = card && card.number > 0 && listScope(card.list_id) !== scope;
    const number = arriving ? nextCardReference(listId) : null;
    updateCardPositions.run(listId, index, id);
    if (number !== null) setCardNumber.run(number, id);
  });
});

/** The board that holds a card, via its list. */
export const boardOfCard = (card: TaskCardRow): Id => {
  const list = taskLists.byId.get(card.list_id);
  if (!list) throw new Error(`Carte ${card.id} sans liste`);
  return list.board_id;
};

// --- Reading a whole board -------------------------------------------------
// Everything that comes with the cards is read for the whole board, in one
// query per kind: members, labels, checklist counts, remaining items. A card
// triggers no query on its own.

const cardsOfBoard = selection<TaskCardRow>(
  `SELECT task_cards.*
   FROM task_cards
   JOIN task_lists ON task_lists.id = task_cards.list_id
   WHERE task_lists.board_id = ?
   ORDER BY task_cards.position, task_cards.id`,
);

const boardMembers = selection<{ card_id: Id; id: Id; name: string; email: string }>(
  `SELECT card_members.card_id, users.id, users.name, users.email
   FROM card_members
   JOIN task_cards ON task_cards.id = card_members.card_id
   JOIN task_lists ON task_lists.id = task_cards.list_id
   JOIN users ON users.id = card_members.user_id
   WHERE task_lists.board_id = ?
   ORDER BY users.name`,
);

const boardLabels = selection<LabelRow & { card_id: Id }>(
  `SELECT card_labels.card_id, labels.*
   FROM card_labels
   JOIN labels ON labels.id = card_labels.label_id
   JOIN task_cards ON task_cards.id = card_labels.card_id
   JOIN task_lists ON task_lists.id = task_cards.list_id
   WHERE task_lists.board_id = ?
   ORDER BY labels.position, labels.id`,
);

// Several checklists on a card: the boxes add up, the badge only shows a
// single ratio. The sum is done in SQL rather than in JavaScript — that is a
// GROUP BY's job.
const countsOfBoard = selection<{ card_id: Id; total: number; done: number }>(
  `SELECT card_checklists.card_id,
          COUNT(checklist_items.id) AS total,
          COALESCE(SUM(checklist_items.done), 0) AS done
   FROM card_checklists
   JOIN task_cards ON task_cards.id = card_checklists.card_id
   JOIN task_lists ON task_lists.id = task_cards.list_id
   LEFT JOIN checklist_items ON checklist_items.checklist_id = card_checklists.id
   WHERE task_lists.board_id = ?
   GROUP BY card_checklists.card_id`,
);

// The unchecked items: that is what a card's badge unfolds, to see what is
// left to do without opening the card.
const boardRemaining = selection<{ card_id: Id; id: Id; text: string }>(
  `SELECT card_checklists.card_id, checklist_items.id, checklist_items.text
   FROM checklist_items
   JOIN card_checklists ON card_checklists.id = checklist_items.checklist_id
   JOIN task_cards ON task_cards.id = card_checklists.card_id
   JOIN task_lists ON task_lists.id = task_cards.list_id
   WHERE task_lists.board_id = ? AND checklist_items.done = 0
   ORDER BY card_checklists.position, card_checklists.id,
            checklist_items.position, checklist_items.id`,
);

// The number of comments on each card: the card shows it next to its
// actors. Milo's notes (creation, history) are not counted: every card has
// at least one, the badge would no longer tell anything.
const commentsOfBoard = selection<{ card_id: Id; total: number }>(
  `SELECT card_comments.card_id, COUNT(*) AS total
   FROM card_comments
   JOIN task_cards ON task_cards.id = card_comments.card_id
   JOIN task_lists ON task_lists.id = task_cards.list_id
   WHERE task_lists.board_id = ? AND card_comments.system = 0
   GROUP BY card_comments.card_id`,
);

const pushItem = <K, V>(map: Map<K, V[]>, key: K, value: V): void => {
  const already = map.get(key);
  if (already) already.push(value);
  else map.set(key, [value]);
};

/**
 * The board is read in one go: each list carries its cards, in order, and
 * each card its members. The description does not follow: the card only cares
 * that it exists, its detail view will fetch the text.
 */
export const listsWithCards = (boardId: unknown): TaskList[] => {
  const accounts = new Map<Id, { total: number; done: number }>();
  for (const row of countsOfBoard.all(boardId)) {
    accounts.set(row.card_id, { total: row.total, done: row.done });
  }

  const remaining = new Map<Id, OpenChecklistItem[]>();
  for (const { card_id, ...item } of boardRemaining.all(boardId)) {
    pushItem(remaining, card_id, item);
  }

  const labels = new Map<Id, Label[]>();
  for (const { card_id, ...label } of boardLabels.all(boardId)) {
    pushItem(labels, card_id, label);
  }

  const members = new Map<Id, Actor[]>();
  for (const row of boardMembers.all(boardId)) {
    pushItem(members, row.card_id, actorOf(row));
  }

  // Cards are grouped by list in one pass: walking them once per list meant
  // reading the board as many times as it has columns.
  const byList = new Map<Id, TaskCard[]>();
  const covers = coverUrlsOfBoard(boardId);
  const linkRecords = linkCountsOfBoard(boardId);
  const parseAttachments = attachmentCountsOfBoard(boardId);
  const comments = new Map(
    commentsOfBoard.all(boardId).map((r) => [r.card_id, r.total]),
  );
  for (const { description, ...card } of cardsOfBoard.all(boardId)) {
    pushItem(byList, card.list_id, {
      ...card,
      cover_urls: covers.get(card.id) ?? [],
      link_count: linkRecords.get(card.id) ?? 0,
      attachment_count: parseAttachments.get(card.id) ?? 0,
      comment_count: comments.get(card.id) ?? 0,
      has_description: hasContent(description),
      members: members.get(card.id) ?? [],
      labels: labels.get(card.id) ?? [],
      checklist_total: accounts.get(card.id)?.total ?? 0,
      checklist_done: accounts.get(card.id)?.done ?? 0,
      checklist_open: remaining.get(card.id) ?? [],
    });
  }

  return taskLists.ofBoard.all(boardId).map((list) => ({
    ...list,
    cards: byList.get(list.id) ?? [],
  }));
};
