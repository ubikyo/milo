// Search: a field at the end of the tab row, which searches everything
// the application holds — projects, cards, requests, machines, accesses — and
// returns only what the person is allowed to see.

import type { Id } from "./domain.js";

export type SearchKind = "project" | "card" | "support" | "asset" | "access";

export interface SearchResult {
  kind: SearchKind;
  id: Id;
  /** What the row shows first: the name, the subject, the label. */
  title: string;
  /** Where the item is: the context, the board, the list… */
  context: string;
  /** A widget: the board that carries it, which opens. */
  board_id?: Id;
  /** Access: the address of a link, which opens directly. */
  url?: string;
}

/** Below this, the search does not run: a single letter would return everything. */
export const SEARCH_MIN_LENGTH = 2;
