import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import type { Id, SearchResult } from "@milo/shared";

// What the search finds beyond the server's index: the e-mails and the
// appointments the Mail and Calendar widgets have read from Microsoft 365.
// The server does not keep them — it reads them from Graph for the page —,
// so each widget publishes here what it has loaded, and the Spotlight
// (SearchBox) adds it to what it searches. They stay known once their board
// is left, until the widget leaves it (BoardPanel) or the page is reloaded.

/** The board whose widgets are displayed: what they publish leads back to it. */
export const SearchBoardContext = createContext<Id | null>(null);

interface Published {
  board_id: Id;
  results: SearchResult[];
}

/** By widget, then by source within it — a calendar and its appointments' list. */
const published = new Map<Id, Map<string, Published>>();

/** Everything the widgets have published, for the Spotlight. */
export const knownResults = (): SearchResult[] =>
  [...published.values()].flatMap((sources) => [...sources.values()].flatMap((p) => p.results));

/**
 * What a widget has loaded, as the search shows it — replaced on each reread.
 * Without a board (a widget outside one), nothing is published: nothing would
 * lead back to it.
 */
export function usePublishedResults(
  blockId: Id,
  source: string,
  results: Omit<SearchResult, "id" | "board_id">[] | null,
) {
  const boardId = useContext(SearchBoardContext);
  useEffect(() => {
    if (boardId === null || results === null) return;
    const sources = published.get(blockId) ?? new Map<string, Published>();
    sources.set(source, {
      board_id: boardId,
      results: results.map((r) => ({ ...r, id: blockId, board_id: boardId })),
    });
    published.set(blockId, sources);
  }, [blockId, source, boardId, results]);
}

/** A board's widgets, as they are now: those removed from it are forgotten. */
export const keepWidgets = (boardId: Id, ids: Id[]) => {
  const kept = new Set(ids);
  for (const [blockId, sources] of published) {
    if (kept.has(blockId)) continue;
    for (const [source, p] of sources) if (p.board_id === boardId) sources.delete(source);
    if (sources.size === 0) published.delete(blockId);
  }
};

// --- An item to open ----------------------------------------------------------
//
// An e-mail found opens in its widget's reader: the page first leads to the
// board, then the widget, once it is displayed and has the e-mail, opens it.

let pending: { blockId: Id; item: string } | null = null;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Asks a widget to open one of its items. */
export const requestOpening = (blockId: Id, item: string) => {
  pending = { blockId, item };
  for (const listener of listeners) listener();
};

/** The item this widget is asked to open; null, none. */
export const useRequestedItem = (blockId: Id): string | null =>
  useSyncExternalStore(subscribe, () => (pending?.blockId === blockId ? pending.item : null));

/** The request is honoured: it is not repeated. */
export const clearRequest = () => {
  pending = null;
  for (const listener of listeners) listener();
};
