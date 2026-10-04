// Les pièces jointes d'une carte, et le ménage des fichiers que plus rien ne
// cite.
//
// Un fichier peut être partagé par plusieurs lignes : copier une liste recopie
// ses pièces jointes sans recopier les fichiers. Une suppression n'efface donc
// le fichier que lorsque la dernière ligne qui le citait s'en va.

import type { Attachment, Id } from "@milo/shared";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type { AttachmentRow, CountRow } from "../db/rows.js";
import { covers } from "./covers.js";
import { isImage, citedMedia, deleteOrphans, deleteMedia, mediaUrl } from "../lib/media.js";

export const attachments = {
  byId: selection<AttachmentRow>("SELECT * FROM card_attachments WHERE id = ?"),
  /** La première ligne qui cite ce fichier : elle en porte le nom d'origine. */
  byFile: selection<AttachmentRow>(
    "SELECT * FROM card_attachments WHERE file = ? ORDER BY id LIMIT 1",
  ),
  ofCard: selection<AttachmentRow>(
    "SELECT * FROM card_attachments WHERE card_id = ? ORDER BY position, id DESC",
  ),
  /** Une pièce déposée se range en tête : avant la première. */
  create: mutation(
    `INSERT INTO card_attachments (card_id, file, name, mime, size, user_id, created_at, position)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7,
       (SELECT COALESCE(MIN(position), 1) - 1 FROM card_attachments WHERE card_id = ?1))`,
  ),
  remove: mutation("DELETE FROM card_attachments WHERE id = ?"),
  /** Combien de lignes citent encore ce fichier. Zéro : il peut partir du disque. */
  countOfFile: scalar<CountRow>(
    `SELECT (SELECT COUNT(*) FROM card_attachments WHERE file = @file)
          + (SELECT COUNT(*) FROM card_covers WHERE file = @file) AS count`,
  ),
};

const store = mutation("UPDATE card_attachments SET position = ? WHERE id = ? AND card_id = ?");

/** L'ordre complet des pièces d'une carte ; un identifiant d'une autre carte est ignoré. */
export const reorderAttachments = transaction((cardId: Id, ids: Id[]) => {
  ids.forEach((id, index) => store.run(index, id, cardId));
});

/** Une pièce jointe telle qu'elle revient au client : avec son adresse. */
export const attachmentOf = (row: AttachmentRow): Attachment => ({
  ...row,
  url: mediaUrl(row.file),
  is_image: isImage(row.file),
});

// Le nombre de pièces jointes de chaque carte d'un tableau : c'est ce qui
// allume le trombone de la carte.
const countsOfBoard = selection<{ card_id: Id; total: number }>(
  `SELECT card_attachments.card_id, COUNT(*) AS total
   FROM card_attachments
   JOIN task_cards ON task_cards.id = card_attachments.card_id
   JOIN task_lists ON task_lists.id = task_cards.list_id
   WHERE task_lists.board_id = ?
   GROUP BY card_attachments.card_id`,
);

export const attachmentCountsOfBoard = (boardId: unknown): Map<Id, number> =>
  new Map(countsOfBoard.all(boardId).map((r) => [r.card_id, r.total]));

export const attachmentsOf = (cardId: Id): Attachment[] =>
  attachments.ofCard.all(cardId).map(attachmentOf);

/**
 * Retire la pièce jointe, et le fichier avec elle s'il ne sert plus à personne.
 * Le fichier part après la ligne, jamais avant : mieux vaut un fichier orphelin
 * — le ménage l'emportera — qu'une ligne qui montre un fichier disparu.
 */
export const removeAttachment = (row: AttachmentRow): void => {
  attachments.remove.run(row.id);
  if (attachments.countOfFile({ file: row.file }).count === 0) deleteMedia(row.file);
};

// --- Ménage ----------------------------------------------------------------

/** Tous les fichiers cités par une pièce jointe. */
const attachmentFiles = selection<{ file: string }>(
  "SELECT DISTINCT file FROM card_attachments",
);

/**
 * Toutes les colonnes qui peuvent porter du HTML, et donc citer une image.
 * Les fils sont du texte simple, mais ils sont relus tout de même : la liste
 * doit valoir pour ce que l'application garde, pas pour ce qu'elle produit
 * aujourd'hui.
 */
const htmlTexts = [
  selection<{ html: string }>("SELECT description AS html FROM task_cards WHERE description <> ''"),
  selection<{ html: string }>("SELECT description AS html FROM projects WHERE description <> ''"),
  selection<{ html: string }>("SELECT text AS html FROM card_comments"),
  selection<{ html: string }>("SELECT text AS html FROM comments"),
  // Les images d'un widget Image : sa configuration cite leurs adresses.
  selection<{ html: string }>("SELECT config AS html FROM board_widgets WHERE type = 'image'"),
];

/**
 * Efface les fichiers que plus aucune pièce jointe et plus aucune description
 * ne cite : une carte supprimée avec sa liste, une image collée puis retirée.
 * Tourne au démarrage puis une fois par jour ; les fichiers récents sont
 * épargnés (voir `DELAI_DE_GRACE`).
 */
export const mediaCleanup = (): number => {
  const cited = new Set<string>();

  for (const { file } of attachmentFiles.all()) cited.add(file);
  for (const { file } of covers.files.all()) cited.add(file);
  for (const reading of htmlTexts) {
    for (const { html } of reading.all()) {
      for (const file of citedMedia(html)) cited.add(file);
    }
  }

  return deleteOrphans(cited);
};
