// A card's attachments, and the cleanup of files nothing cites anymore.
//
// A file may be shared by several rows: copying a list copies its attachments
// without copying the files. A deletion therefore erases the file only when
// the last row citing it goes away.

import type { Attachment, Id } from "@milo/shared";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type { AttachmentRow, CountRow } from "../db/rows.js";
import { DECLARED_ASSET_KINDS } from "@milo/shared";
import { declaredAssetTables } from "../db/declared-asset-tables.js";
import { covers } from "./covers.js";
import { isImage, citedMedia, deleteOrphans, deleteMedia, mediaUrl } from "../lib/media.js";

/** The declared assets' tables, whose photos and documents are media too. */
const DECLARED_TABLES = DECLARED_ASSET_KINDS.map(declaredAssetTables);

export const attachments = {
  byId: selection<AttachmentRow>("SELECT * FROM card_attachments WHERE id = ?"),
  /**
   * The first row that cites this file — a card's attachment, or a declared
   * asset's document —: it carries the original name.
   */
  byFile: selection<{ name: string }>(
    `SELECT name FROM card_attachments WHERE file = @file
     ${DECLARED_TABLES.map((t) => `UNION ALL SELECT name FROM ${t.attachments} WHERE file = @file`).join("\n")}
     LIMIT 1`,
  ),
  ofCard: selection<AttachmentRow>(
    "SELECT * FROM card_attachments WHERE card_id = ? ORDER BY position, id DESC",
  ),
  /** A dropped attachment is placed first: before the first one. */
  create: mutation(
    `INSERT INTO card_attachments (card_id, file, name, mime, size, user_id, created_at, position)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7,
       (SELECT COALESCE(MIN(position), 1) - 1 FROM card_attachments WHERE card_id = ?1))`,
  ),
  remove: mutation("DELETE FROM card_attachments WHERE id = ?"),
  /** How many rows still cite this file. Zero: it may leave the disk. */
  countOfFile: scalar<CountRow>(
    `SELECT (SELECT COUNT(*) FROM card_attachments WHERE file = @file)
          + (SELECT COUNT(*) FROM card_covers WHERE file = @file)
          ${DECLARED_TABLES.map(
            (t) =>
              `+ (SELECT COUNT(*) FROM ${t.attachments} WHERE file = @file)
               + (SELECT COUNT(*) FROM ${t.photos} WHERE file = @file)`,
          ).join("\n")} AS count`,
  ),
};

const store = mutation("UPDATE card_attachments SET position = ? WHERE id = ? AND card_id = ?");

/** The complete order of a card's attachments; an identifier from another card is ignored. */
export const reorderAttachments = transaction((cardId: Id, ids: Id[]) => {
  ids.forEach((id, index) => store.run(index, id, cardId));
});

/** An attachment as it returns to the client: with its address. */
export const attachmentOf = (row: AttachmentRow): Attachment => ({
  ...row,
  url: mediaUrl(row.file),
  is_image: isImage(row.file),
});

// The number of attachments of each card of a board: it is what lights the
// card's paperclip.
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
 * Removes the attachment, and the file with it if nobody uses it anymore.
 * The file goes after the row, never before: better an orphan file — the
 * cleanup will take it — than a row showing a vanished file.
 */
export const removeAttachment = (row: AttachmentRow): void => {
  attachments.remove.run(row.id);
  if (attachments.countOfFile({ file: row.file }).count === 0) deleteMedia(row.file);
};

// --- Cleanup ---------------------------------------------------------------

/** All files cited by an attachment — a card's, or a declared asset's document — or a photo. */
const attachmentFiles = selection<{ file: string }>(
  `SELECT file FROM card_attachments
   ${DECLARED_TABLES.map((t) => `UNION SELECT file FROM ${t.attachments} UNION SELECT file FROM ${t.photos}`).join("\n")}`,
);

/**
 * All the columns that may carry HTML, and therefore cite an image. Threads
 * are plain text, but they are re-read all the same: the list must hold for
 * what the application stores, not for what it produces today.
 */
const htmlTexts = [
  selection<{ html: string }>("SELECT description AS html FROM task_cards WHERE description <> ''"),
  selection<{ html: string }>("SELECT description AS html FROM projects WHERE description <> ''"),
  selection<{ html: string }>("SELECT text AS html FROM card_comments"),
  selection<{ html: string }>("SELECT text AS html FROM comments"),
  // An Image widget's images: its configuration cites their addresses.
  selection<{ html: string }>("SELECT config AS html FROM board_widgets WHERE type = 'image'"),
];

/**
 * Erases files that no attachment and no description cites anymore: a card
 * deleted with its list, a pasted then removed image. Runs at startup then
 * once a day; recent files are spared (see `GRACE_PERIOD`).
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
