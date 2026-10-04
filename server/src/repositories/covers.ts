// Les images de couverture d'une carte. Leur fichier vit dans le dossier des
// médias, comme celui d'une pièce jointe ; il part avec la dernière ligne qui
// le cite.

import type { CardCover, Id } from "@milo/shared";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type { NextRow } from "../db/rows.js";
import { deleteMedia, mediaUrl } from "../lib/medias.js";
import { attachments } from "./attachments.js";

export interface CardCoverRow {
  id: Id;
  card_id: Id;
  file: string;
  name: string;
  size: number;
  position: number;
  created_at: string;
}

export const covers = {
  byId: selection<CardCoverRow>("SELECT * FROM card_covers WHERE id = ?"),
  ofCard: selection<CardCoverRow>(
    "SELECT * FROM card_covers WHERE card_id = ? ORDER BY position, id",
  ),
  nextPosition: scalar<NextRow>(
    "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM card_covers WHERE card_id = ?",
  ),
  create: mutation(
    `INSERT INTO card_covers (card_id, file, name, size, position, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ),
  remove: mutation("DELETE FROM card_covers WHERE id = ?"),
  /** Tous les fichiers cités par une couverture, pour le ménage des médias. */
  files: selection<{ file: string }>("SELECT DISTINCT file FROM card_covers"),
};

const store = mutation("UPDATE card_covers SET position = ? WHERE id = ? AND card_id = ?");

/** L'ordre complet des couvertures d'une carte ; un identifiant d'une autre carte est ignoré. */
export const reorderCovers = transaction((cardId: Id, ids: Id[]) => {
  ids.forEach((id, index) => store.run(index, id, cardId));
});

/** Retire la couverture, et son fichier si plus rien ne le cite. */
export const removeCover = (row: CardCoverRow): void => {
  covers.remove.run(row.id);
  if (attachments.countOfFile({ file: row.file }).count === 0) deleteMedia(row.file);
};

export const coverOf = (row: CardCoverRow): CardCover => ({ ...row, url: mediaUrl(row.file) });

/** Les adresses des couvertures de toutes les cartes d'un tableau, dans leur ordre. */
const coversOfBoard = selection<{ card_id: Id; file: string }>(
  `SELECT card_covers.card_id, card_covers.file
   FROM card_covers
   JOIN task_cards ON task_cards.id = card_covers.card_id
   JOIN task_lists ON task_lists.id = task_cards.list_id
   WHERE task_lists.board_id = ?
   ORDER BY card_covers.position, card_covers.id`,
);

export const coverUrlsOfBoard = (boardId: unknown): Map<Id, string[]> => {
  const byCard = new Map<Id, string[]>();
  for (const { card_id, file } of coversOfBoard.all(boardId)) {
    const already = byCard.get(card_id);
    if (already) already.push(mediaUrl(file));
    else byCard.set(card_id, [mediaUrl(file)]);
  }
  return byCard;
};

export const coversOf = (cardId: Id): CardCover[] => covers.ofCard.all(cardId).map(coverOf);
