// Search: a field at the end of the tab row, which opens the Spotlight and
// searches everything the application holds — projects, cards, requests,
// machines, accesses. The server hands over all that the person is allowed to
// see; the client searches it, fuzzily (Fuse.js).

import type { Id } from "./domain.js";

export type SearchKind = "project" | "card" | "support" | "asset" | "access";

export interface SearchResult {
  kind: SearchKind;
  /** The item's — for an Access element, its widget's, shared by its links. */
  id: Id;
  /** What the row shows first: the name, the subject, the label. */
  title: string;
  /** Where the item is: the context, the board, the list… */
  context: string;
  /** A widget: the board that carries it, which opens. */
  board_id?: Id;
  /** Access: the address of a link, which opens directly. */
  url?: string;
  /**
   * What is searched besides the title and context, never shown: the
   * description's start, the sender, the address, the last user…
   */
  keywords?: string;
}
