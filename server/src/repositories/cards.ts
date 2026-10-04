// La fiche d'une carte : sa description, ses membres, ses étiquettes, ses
// checklists, ses pièces jointes et son fil de commentaires.

import type { Actor, Checklist, ChecklistItem, Id, Label, TaskCardDetail } from "@milo/shared";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type {
  CardCommentRow,
  ChecklistItemRow,
  ChecklistRow,
  LabelRow,
  NextRow,
  TaskCardRow,
  WithAuthorColumns,
} from "../db/rows.js";
import { attachmentsOf } from "./attachments.js";
import { coversOf } from "./covers.js";
import { linksOf } from "./links.js";
import { withAuthor } from "./comments.js";
import { actorOf } from "./users.js";

// --- Membres et étiquettes d'une carte -------------------------------------

const cardMembers = selection<{ id: Id; name: string; email: string }>(
  `SELECT users.id, users.name, users.email
   FROM card_members
   JOIN users ON users.id = card_members.user_id
   WHERE card_members.card_id = ?
   ORDER BY users.name`,
);

export const membersOf = (cardId: Id): Actor[] => cardMembers.all(cardId).map(actorOf);

const deleteMembers = mutation("DELETE FROM card_members WHERE card_id = ?");
const addMember = mutation(
  `INSERT OR IGNORE INTO card_members (card_id, user_id)
   SELECT ?, id FROM users WHERE id = ?`,
);

const memberIds = selection<{ user_id: Id }>(
  "SELECT user_id FROM card_members WHERE card_id = ?",
);

// Un acteur retiré de la carte l'est aussi des éléments de ses checklists : on
// ne garde pas une part d'une tâche à qui n'y prend plus part. Seuls ceux qu'on
// retire ici sont touchés — une personne posée sur un élément sans être acteur
// de la carte y reste.
const removeFromChecklistItems = mutation(
  `DELETE FROM checklist_item_members
   WHERE user_id = ?
     AND item_id IN (
       SELECT checklist_items.id
       FROM checklist_items
       JOIN card_checklists ON card_checklists.id = checklist_items.checklist_id
       WHERE card_checklists.card_id = ?
     )`,
);

export const replaceCardMembers = transaction((cardId: Id, userIds: Id[]) => {
  const removed = memberIds
    .all(cardId)
    .map((m) => m.user_id)
    .filter((id) => !userIds.includes(id));
  deleteMembers.run(cardId);
  for (const userId of userIds) addMember.run(cardId, userId);
  for (const userId of removed) removeFromChecklistItems.run(userId, cardId);
});

const cardLabels = selection<LabelRow>(
  `SELECT labels.*
   FROM card_labels
   JOIN labels ON labels.id = card_labels.label_id
   WHERE card_labels.card_id = ?
   ORDER BY labels.position, labels.id`,
);

export const labelsOf = (cardId: Id): Label[] => cardLabels.all(cardId);

const deleteLabels = mutation("DELETE FROM card_labels WHERE card_id = ?");
const addLabel = mutation(
  `INSERT OR IGNORE INTO card_labels (card_id, label_id)
   SELECT ?, id FROM labels WHERE id = ? AND board_id = ?`,
);

/**
 * Une carte ne porte que les étiquettes de son propre tableau : celles d'un
 * autre sont ignorées plutôt que refusées, comme pour les membres.
 */
export const replaceCardLabels = transaction((cardId: Id, labelIds: Id[], boardId: Id) => {
  deleteLabels.run(cardId);
  for (const labelId of labelIds) addLabel.run(cardId, labelId, boardId);
});

// --- Checklists ------------------------------------------------------------

export const checklists = {
  byId: selection<ChecklistRow>("SELECT * FROM card_checklists WHERE id = ?"),
  ofCard: selection<ChecklistRow>(
    "SELECT * FROM card_checklists WHERE card_id = ? ORDER BY position, id",
  ),
  idsOfCard: selection<{ id: Id }>("SELECT id FROM card_checklists WHERE card_id = ?"),
  nextPosition: scalar<NextRow>(
    "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM card_checklists WHERE card_id = ?",
  ),
  create: mutation(
    "INSERT INTO card_checklists (card_id, title, position, created_at) VALUES (?, ?, ?, ?)",
  ),
  rename: mutation("UPDATE card_checklists SET title = ? WHERE id = ?"),
  remove: mutation("DELETE FROM card_checklists WHERE id = ?"),
};

export const checklistItems = {
  byId: selection<ChecklistItemRow>("SELECT * FROM checklist_items WHERE id = ?"),
  idsOfChecklist: selection<{ id: Id }>("SELECT id FROM checklist_items WHERE checklist_id = ?"),
  nextPosition: scalar<NextRow>(
    "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM checklist_items WHERE checklist_id = ?",
  ),
  create: mutation(
    "INSERT INTO checklist_items (checklist_id, text, position, created_at) VALUES (?, ?, ?, ?)",
  ),
  update: mutation("UPDATE checklist_items SET text = ?, done = ?, due_date = ? WHERE id = ?"),
  remove: mutation("DELETE FROM checklist_items WHERE id = ?"),
};

const updateChecklistPositions = mutation(
  "UPDATE card_checklists SET position = ? WHERE id = ? AND card_id = ?",
);
export const reorderChecklists = transaction((cardId: Id, ids: Id[]) => {
  ids.forEach((id, index) => updateChecklistPositions.run(index, id, cardId));
});

const updateItemPositions = mutation(
  "UPDATE checklist_items SET position = ? WHERE id = ? AND checklist_id = ?",
);
export const reorderChecklistItems = transaction((checklistId: Id, ids: Id[]) => {
  ids.forEach((id, index) => updateItemPositions.run(index, id, checklistId));
});

const deleteElementMembers = mutation("DELETE FROM checklist_item_members WHERE item_id = ?");
const addMemberItem = mutation(
  `INSERT OR IGNORE INTO checklist_item_members (item_id, user_id)
   SELECT ?, id FROM users WHERE id = ?`,
);

const itemMembers = selection<{ user_id: Id }>(
  "SELECT user_id FROM checklist_item_members WHERE item_id = ?",
);

export const itemMemberIds = (itemId: Id): Id[] =>
  itemMembers.all(itemId).map((m) => m.user_id);

export const replaceChecklistItemMembers = transaction((itemId: Id, userIds: Id[]) => {
  deleteElementMembers.run(itemId);
  for (const userId of userIds) addMemberItem.run(itemId, userId);
});

// Les éléments d'une checklist et leurs membres : deux requêtes pour toute la
// checklist, au lieu d'une par élément — c'est ce que faisait la lecture d'une
// fiche, une requête par ligne de chaque checklist.

const selectItemsOfChecklist = selection<ChecklistItemRow>(
  "SELECT * FROM checklist_items WHERE checklist_id = ? ORDER BY position, id",
);

const membersByItem = selection<{ item_id: Id; id: Id; name: string; email: string }>(
  `SELECT checklist_item_members.item_id, users.id, users.name, users.email
   FROM checklist_item_members
   JOIN checklist_items ON checklist_items.id = checklist_item_members.item_id
   JOIN users ON users.id = checklist_item_members.user_id
   WHERE checklist_items.checklist_id = ?
   ORDER BY users.name`,
);

export const itemsOfChecklist = (checklistId: Id): ChecklistItem[] => {
  const byItem = new Map<Id, Actor[]>();
  for (const row of membersByItem.all(checklistId)) {
    const already = byItem.get(row.item_id);
    if (already) already.push(actorOf(row));
    else byItem.set(row.item_id, [actorOf(row)]);
  }

  return selectItemsOfChecklist.all(checklistId).map((item) => ({
    ...item,
    members: byItem.get(item.id) ?? [],
  }));
};

export const checklistsOfCard = (cardId: Id): Checklist[] =>
  checklists.ofCard.all(cardId).map((checklist) => ({
    ...checklist,
    items: itemsOfChecklist(checklist.id),
  }));

/** La checklist qui porte un élément. */
export const checklistOfItem = (item: ChecklistItemRow): ChecklistRow => {
  const checklist = checklists.byId.get(item.checklist_id);
  if (!checklist) throw new Error(`Élément ${item.id} sans checklist`);
  return checklist;
};

/** Une checklist telle qu'elle revient au client : avec ses éléments. */
export const checklistWithItems = (checklist: ChecklistRow): Checklist => ({
  ...checklist,
  items: itemsOfChecklist(checklist.id),
});

// --- Fil de commentaires d'une carte ---------------------------------------

const CARD_COMMENT_SELECT = `
  SELECT card_comments.*, users.name AS author_name, users.email AS author_email
  FROM card_comments
  LEFT JOIN users ON users.id = card_comments.user_id
`;

export const cardComments = {
  byId: selection<WithAuthorColumns<CardCommentRow>>(
    `${CARD_COMMENT_SELECT} WHERE card_comments.id = ?`,
  ),
  ofCard: selection<WithAuthorColumns<CardCommentRow>>(
    `${CARD_COMMENT_SELECT} WHERE card_comments.card_id = ? ORDER BY card_comments.created_at ASC`,
  ),
  create: mutation(
    `INSERT INTO card_comments (card_id, user_id, text, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ),
  createSystem: mutation(
    `INSERT INTO card_comments (card_id, user_id, text, system, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)`,
  ),
  update: mutation("UPDATE card_comments SET text = ?, updated_at = ? WHERE id = ?"),
  remove: mutation("DELETE FROM card_comments WHERE id = ?"),
};

/** La carte et tout ce qui l'accompagne, pour son tiroir. */
export const cardDetail = (card: TaskCardRow, userId: Id): TaskCardDetail => ({
  ...card,
  members: membersOf(card.id),
  labels: labelsOf(card.id),
  checklists: checklistsOfCard(card.id),
  attachments: attachmentsOf(card.id),
  covers: coversOf(card.id),
  links: linksOf(card.id, userId),
  comments: cardComments.ofCard.all(card.id).map(withAuthor),
});
