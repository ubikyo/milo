// Les dépendances entre cartes. Une liaison s'écrit une fois, de sa source
// vers sa cible ; chaque carte la lit depuis son côté (shared, dependances.ts).

import { PAGE_DE_LIAISONS, TASK_REFERENCE_PREFIX, relationLue } from "@milo/shared";
import type { CardLink, Id, LinkCandidates, SorteDeLiaison } from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import type { Selection } from "../db/query.js";
import { CLAUSE_TABLEAUX_VISIBLES } from "./boards.js";

export interface CardLinkRow {
  id: Id;
  source_id: Id;
  target_id: Id;
  kind: SorteDeLiaison;
  created_at: string;
}

export const cardLinks = {
  byId: selection<CardLinkRow>("SELECT * FROM card_links WHERE id = ?"),
  /**
   * La même liaison, dans un sens ou dans l'autre : « X est lié à Y » et « Y
   * est lié à X » ne font qu'une.
   */
  existante: selection<{ id: Id }>(
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

// L'autre carte n'est montrée que si son tableau l'est à cette personne : une
// dépendance vers un tableau privé ne le laisse pas deviner.
const liaisonsDeLaCarte = selection<
  CardLinkRow & {
    autre_id: Id;
    autre_text: string;
    autre_number: number;
    board_id: Id;
    board_name: string;
  }
>(
  `SELECT card_links.*, task_cards.id AS autre_id, task_cards.text AS autre_text,
          task_cards.number AS autre_number, boards.id AS board_id, boards.name AS board_name
   FROM card_links
   JOIN task_cards ON task_cards.id = CASE WHEN card_links.source_id = @card
                                          THEN card_links.target_id
                                          ELSE card_links.source_id END
   JOIN task_lists ON task_lists.id = task_cards.list_id
   JOIN boards ON boards.id = task_lists.board_id
   WHERE (card_links.source_id = @card OR card_links.target_id = @card)
     AND ${CLAUSE_TABLEAUX_VISIBLES("boards.id")}
   ORDER BY card_links.created_at, card_links.id`,
);

/** Les dépendances d'une carte, telles qu'elle les lit et que `userId` les voit. */
export const linksOf = (cardId: Id, userId: Id): CardLink[] =>
  liaisonsDeLaCarte.all({ card: cardId, me: userId }).map((row) => ({
    id: row.id,
    relation: relationLue(row.kind, row.source_id === cardId),
    card: {
      id: row.autre_id,
      text: row.autre_text,
      number: row.autre_number,
      board_id: row.board_id,
      board_name: row.board_name,
    },
  }));

/** Une liaison lue depuis l'une de ses deux cartes. */
export const linkOf = (row: CardLinkRow, cardId: Id, userId: Id): CardLink =>
  linksOf(cardId, userId).find((l) => l.id === row.id)!;

// Les cartes qu'une dépendance peut relier : celles du tableau de la carte en
// tête, dans l'ordre des listes, puis celles des autres tableaux visibles,
// par nom de tableau. On y cherche comme dans la recherche globale — sans
// accents, par titre ou par référence. La requête se prépare au premier appel :
// « milo_plier » est déclarée par la recherche (routes/search.ts), chargée avec
// l'application.
let candidatsPrepares: Selection<LinkCandidates["items"][number]> | null = null;

export const linkCandidates = (
  card: { id: Id; board_id: Id },
  userId: Id,
  recherche: string,
  offset: number,
): LinkCandidates => {
  candidatsPrepares ??= selection(
    `SELECT tc.id, tc.text, tc.number, b.id AS board_id, b.name AS board_name,
            (b.id = @board) AS same_board
     FROM task_cards tc
     JOIN task_lists tl ON tl.id = tc.list_id
     JOIN boards b ON b.id = tl.board_id
     WHERE tc.kind = 'card' AND tc.id != @card
       AND ${CLAUSE_TABLEAUX_VISIBLES("b.id")}
       AND (@q = '%%'
         OR milo_plier(tc.text) LIKE @q ESCAPE '\\'
         OR (tc.number > 0 AND milo_plier('${TASK_REFERENCE_PREFIX}' || tc.number) LIKE @q ESCAPE '\\'))
     ORDER BY same_board DESC, b.name, b.id, tl.position, tl.id, tc.position, tc.id
     LIMIT @limit OFFSET @offset`,
  );
  const plie = recherche
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\\%_]/g, (c) => `\\${c}`);
  const lignes = candidatsPrepares.all({
    card: card.id,
    board: card.board_id,
    me: userId,
    q: `%${plie}%`,
    // Une ligne de plus que la page : elle dit s'il en reste.
    limit: PAGE_DE_LIAISONS + 1,
    offset,
  });
  return {
    items: lignes
      .slice(0, PAGE_DE_LIAISONS)
      .map((l) => ({ ...l, same_board: Boolean(l.same_board) })),
    more: lignes.length > PAGE_DE_LIAISONS,
  };
};

// Le nombre de liaisons de chaque carte d'un tableau, des deux côtés : c'est
// ce qui allume le picto de la carte.
const comptesDuTableau = selection<{ card_id: Id; total: number }>(
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
  new Map(comptesDuTableau.all(boardId).map((r) => [r.card_id, r.total]));
