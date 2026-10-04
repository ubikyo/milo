// Dependencies between cards. A link is written once, from its source to its
// target; each card reads it from its own side (shared, dependencies.ts).

import { LINKS_PAGE_SIZE, TASK_REFERENCE_PREFIX, relationFromSide } from "@milo/shared";
import type { CardLink, Id, LinkCandidates, LinkKind } from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import type { Selection } from "../db/query.js";
import { VISIBLE_BOARDS_CLAUSE } from "./boards.js";

export interface CardLinkRow {
  id: Id;
  source_id: Id;
  target_id: Id;
  kind: LinkKind;
  created_at: string;
}

export const cardLinks = {
  byId: selection<CardLinkRow>("SELECT * FROM card_links WHERE id = ?"),
  /**
   * The same link, in one direction or the other: "X is linked to Y" and "Y
   * is linked to X" are one and the same.
   */
  existing: selection<{ id: Id }>(
    `SELECT id FROM card_links
     WHERE kind = @kind AND id != @sauf
       AND ((source_id = @source AND target_id = @target)
         OR (source_id = @target AND target_id = @source))`,
  ),
  create: mutation(
    "INSERT INTO card_links (source_id, target_id, kind, created_at) VALUES (?, ?, ?, ?)",
  ),
  update: mutation("UPDATE card_links SET source_id = ?, target_id = ?, kind = ? WHERE id = ?"),
  remove: mutation("DELETE FROM card_links WHERE id = ?"),
};

// The other card is shown only if its board is visible to that person: a
// dependency toward a private board does not let it be guessed.
const cardLinkRecords = selection<
  CardLinkRow & {
    other_id: Id;
    other_text: string;
    other_number: number;
    board_id: Id;
    board_name: string;
  }
>(
  `SELECT card_links.*, task_cards.id AS other_id, task_cards.text AS other_text,
          task_cards.number AS other_number, boards.id AS board_id, boards.name AS board_name
   FROM card_links
   JOIN task_cards ON task_cards.id = CASE WHEN card_links.source_id = @card
                                          THEN card_links.target_id
                                          ELSE card_links.source_id END
   JOIN task_lists ON task_lists.id = task_cards.list_id
   JOIN boards ON boards.id = task_lists.board_id
   WHERE (card_links.source_id = @card OR card_links.target_id = @card)
     AND ${VISIBLE_BOARDS_CLAUSE("boards.id")}
   ORDER BY card_links.created_at, card_links.id`,
);

/** A card's dependencies, as it reads them and as `userId` sees them. */
export const linksOf = (cardId: Id, userId: Id): CardLink[] =>
  cardLinkRecords.all({ card: cardId, me: userId }).map((row) => ({
    id: row.id,
    relation: relationFromSide(row.kind, row.source_id === cardId),
    card: {
      id: row.other_id,
      text: row.other_text,
      number: row.other_number,
      board_id: row.board_id,
      board_name: row.board_name,
    },
  }));

/** A link read from one of its two cards. */
export const linkOf = (row: CardLinkRow, cardId: Id, userId: Id): CardLink =>
  linksOf(cardId, userId).find((l) => l.id === row.id)!;

// The cards a dependency can link: those of the leading card's board, in list
// order, then those of the other visible boards, by board name. They are
// searched like in the global search — accent-insensitive, by title or
// reference. The query is prepared on first call: "milo_fold" is declared by
// the search (routes/search.ts), loaded with the application.
let preparedCandidates: Selection<LinkCandidates["items"][number]> | null = null;

export const linkCandidates = (
  card: { id: Id; board_id: Id },
  userId: Id,
  search: string,
  offset: number,
): LinkCandidates => {
  preparedCandidates ??= selection(
    `SELECT tc.id, tc.text, tc.number, b.id AS board_id, b.name AS board_name,
            (b.id = @board) AS same_board
     FROM task_cards tc
     JOIN task_lists tl ON tl.id = tc.list_id
     JOIN boards b ON b.id = tl.board_id
     WHERE tc.kind = 'card' AND tc.id != @card
       AND ${VISIBLE_BOARDS_CLAUSE("b.id")}
       AND (@q = '%%'
         OR milo_fold(tc.text) LIKE @q ESCAPE '\\'
         OR (tc.number > 0 AND milo_fold('${TASK_REFERENCE_PREFIX}' || tc.number) LIKE @q ESCAPE '\\'))
     ORDER BY same_board DESC, b.name, b.id, tl.position, tl.id, tc.position, tc.id
     LIMIT @limit OFFSET @offset`,
  );
  const folded = search
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\\%_]/g, (c) => `\\${c}`);
  const rows = preparedCandidates.all({
    card: card.id,
    board: card.board_id,
    me: userId,
    q: `%${folded}%`,
    // One more row than the page: it says whether any remain.
    limit: LINKS_PAGE_SIZE + 1,
    offset,
  });
  return {
    items: rows
      .slice(0, LINKS_PAGE_SIZE)
      .map((l) => ({ ...l, same_board: Boolean(l.same_board) })),
    more: rows.length > LINKS_PAGE_SIZE,
  };
};

// The number of links of each card of a board, on both sides: it is what
// lights the card's pictogram.
const countsOfBoard = selection<{ card_id: Id; total: number }>(
  `SELECT card_id, COUNT(*) AS total FROM (
     SELECT card_links.source_id AS card_id FROM card_links
     UNION ALL
     SELECT card_links.target_id FROM card_links
   ) AS bouts
   JOIN task_cards ON task_cards.id = bouts.card_id
   JOIN task_lists ON task_lists.id = task_cards.list_id
   WHERE task_lists.board_id = ?
   GROUP BY card_id`,
);

export const linkCountsOfBoard = (boardId: unknown): Map<Id, number> =>
  new Map(countsOfBoard.all(boardId).map((r) => [r.card_id, r.total]));
