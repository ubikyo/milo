// Les listes d'un tableau et leurs cartes : ce que le mode Tâche lit d'un bloc.

import type { Actor, Id, Label, OpenChecklistItem, TaskCard, TaskList } from "@milo/shared";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type { LabelRow, NextRow, TaskCardRow, TaskListRow } from "../db/rows.js";
import { hasContent } from "../lib/html.js";
import { attachmentCountsOfBoard } from "./attachments.js";
import { coverUrlsOfBoard } from "./covers.js";
import { linkCountsOfBoard } from "./links.js";
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
    `INSERT INTO task_cards (list_id, text, position, number, kind, context_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ),
  update: mutation(
    `UPDATE task_cards
     SET text = @text, description = @description, due_date = @due_date,
         start_date = @start_date, due_form = @due_form, recurrence = @recurrence, reminder = @reminder,
         context_id = @context_id, cover_interval = @cover_interval,
         -- Une échéance ou un rappel qui change rouvre le rappel.
         reminded_for = CASE WHEN due_date = @due_date AND reminder = @reminder
                             THEN reminded_for ELSE '' END
     WHERE id = @id`,
  ),
  /**
   * Les cartes d'une liste passée à un autre tableau prennent le premier de
   * ses contextes : ceux de l'ancien n'y ont pas cours.
   */
  reassignContext: mutation(
    `UPDATE task_cards SET context_id =
       (SELECT id FROM contexts WHERE board_id = ? ORDER BY position, id LIMIT 1)
     WHERE list_id = ?`,
  ),
  /** La description seule : celle qu'une carte reçoit dès sa création. */
  describe: mutation("UPDATE task_cards SET description = ? WHERE id = ?"),
  remove: mutation("DELETE FROM task_cards WHERE id = ?"),
  /** Vider une liste de ses tâches : ses séparateurs restent en place. */
  removeTasksOfList: mutation("DELETE FROM task_cards WHERE list_id = ? AND kind = 'card'"),
  /** Les cartes d'un tableau, en identifiants : une carte ne se déplace qu'à l'intérieur du sien. */
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
export const reorderTaskCards = transaction((listId: Id, ids: Id[]) => {
  ids.forEach((id, index) => updateCardPositions.run(listId, index, id));
});

/** Le tableau qui porte une carte, par sa liste. */
export const boardOfCard = (card: TaskCardRow): Id => {
  const list = taskLists.byId.get(card.list_id);
  if (!list) throw new Error(`Carte ${card.id} sans liste`);
  return list.board_id;
};

// --- Lecture d'un tableau entier -------------------------------------------
// Tout ce qui accompagne les cartes est lu pour le tableau entier, en une
// requête par sorte : membres, étiquettes, comptes de checklists, éléments
// restants. Une carte ne déclenche aucune requête à elle seule.

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

// Plusieurs checklists sur une carte : les cases s'additionnent, la pastille
// n'en montre qu'un seul rapport. La somme se fait en SQL plutôt qu'en
// JavaScript — c'est le travail d'un GROUP BY.
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

// Les éléments non cochés : c'est ce que déplie la pastille d'une carte, pour
// voir ce qu'il reste à faire sans ouvrir la fiche.
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

// Le nombre de commentaires de chaque carte : la carte l'affiche à côté de ses
// acteurs.
const commentsOfBoard = selection<{ card_id: Id; total: number }>(
  `SELECT card_comments.card_id, COUNT(*) AS total
   FROM card_comments
   JOIN task_cards ON task_cards.id = card_comments.card_id
   JOIN task_lists ON task_lists.id = task_cards.list_id
   WHERE task_lists.board_id = ?
   GROUP BY card_comments.card_id`,
);

const pushItem = <K, V>(map: Map<K, V[]>, key: K, value: V): void => {
  const already = map.get(key);
  if (already) already.push(value);
  else map.set(key, [value]);
};

/**
 * Le tableau se lit d'un bloc : chaque liste porte ses cartes, dans l'ordre, et
 * chaque carte ses membres. La description, elle, ne suit pas : seule son
 * existence intéresse la carte, sa fiche ira chercher le texte.
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

  // Les cartes sont rangées par liste en un passage : les parcourir une fois
  // par liste revenait à lire le tableau autant de fois qu'il a de colonnes.
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
