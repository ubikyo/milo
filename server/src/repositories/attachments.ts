// Les pièces jointes d'une carte, et le ménage des fichiers que plus rien ne
// cite.
//
// Un fichier peut être partagé par plusieurs lignes : copier une liste recopie
// ses pièces jointes sans recopier les fichiers. Une suppression n'efface donc
// le fichier que lorsque la dernière ligne qui le citait s'en va.

import type { Attachment, Id } from "@milo/shared";
import { mutation, scalar, selection } from "../db/query.js";
import type { AttachmentRow, CountRow } from "../db/rows.js";
import { estUneImage, mediasCites, supprimerLesOrphelins, supprimerMedia, urlMedia } from "../lib/medias.js";

export const attachments = {
  byId: selection<AttachmentRow>("SELECT * FROM card_attachments WHERE id = ?"),
  /** La première ligne qui cite ce fichier : elle en porte le nom d'origine. */
  byFile: selection<AttachmentRow>(
    "SELECT * FROM card_attachments WHERE file = ? ORDER BY id LIMIT 1",
  ),
  ofCard: selection<AttachmentRow>(
    "SELECT * FROM card_attachments WHERE card_id = ? ORDER BY id DESC",
  ),
  create: mutation(
    `INSERT INTO card_attachments (card_id, file, name, mime, size, user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ),
  remove: mutation("DELETE FROM card_attachments WHERE id = ?"),
  /** Combien de lignes citent encore ce fichier. Zéro : il peut partir du disque. */
  countOfFile: scalar<CountRow>("SELECT COUNT(*) AS count FROM card_attachments WHERE file = ?"),
};

/** Une pièce jointe telle qu'elle revient au client : avec son adresse. */
export const attachmentOf = (row: AttachmentRow): Attachment => ({
  ...row,
  url: urlMedia(row.file),
  is_image: estUneImage(row.file),
});

export const attachmentsOf = (cardId: Id): Attachment[] =>
  attachments.ofCard.all(cardId).map(attachmentOf);

/**
 * Retire la pièce jointe, et le fichier avec elle s'il ne sert plus à personne.
 * Le fichier part après la ligne, jamais avant : mieux vaut un fichier orphelin
 * — le ménage l'emportera — qu'une ligne qui montre un fichier disparu.
 */
export const removeAttachment = (row: AttachmentRow): void => {
  attachments.remove.run(row.id);
  if (attachments.countOfFile(row.file).count === 0) supprimerMedia(row.file);
};

// --- Ménage ----------------------------------------------------------------

/** Tous les fichiers cités par une pièce jointe. */
const fichiersDesPiecesJointes = selection<{ file: string }>(
  "SELECT DISTINCT file FROM card_attachments",
);

/**
 * Toutes les colonnes qui peuvent porter du HTML, et donc citer une image.
 * Les fils sont du texte simple, mais ils sont relus tout de même : la liste
 * doit valoir pour ce que l'application garde, pas pour ce qu'elle produit
 * aujourd'hui.
 */
const textesHtml = [
  selection<{ html: string }>("SELECT description AS html FROM task_cards WHERE description <> ''"),
  selection<{ html: string }>("SELECT description AS html FROM projects WHERE description <> ''"),
  selection<{ html: string }>("SELECT text AS html FROM card_comments"),
  selection<{ html: string }>("SELECT text AS html FROM comments"),
];

/**
 * Efface les fichiers que plus aucune pièce jointe et plus aucune description
 * ne cite : une carte supprimée avec sa liste, une image collée puis retirée.
 * Tourne au démarrage puis une fois par jour ; les fichiers récents sont
 * épargnés (voir `DELAI_DE_GRACE`).
 */
export const menageDesMedias = (): number => {
  const cites = new Set<string>();

  for (const { file } of fichiersDesPiecesJointes.all()) cites.add(file);
  for (const lecture of textesHtml) {
    for (const { html } of lecture.all()) {
      for (const fichier of mediasCites(html)) cites.add(fichier);
    }
  }

  return supprimerLesOrphelins(cites);
};
