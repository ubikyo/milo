// Search: a field at the end of the tab row, which opens the Spotlight and
// searches everything the application holds — projects, cards, requests,
// machines, accesses, RSS articles. The server hands over all that the person
// is allowed to see; the client adds the e-mails and appointments its widgets
// have read from Microsoft 365, and searches it all, fuzzily (Fuse.js).

import type { Id } from "./domain.js";

export type SearchKind =
  | "project"
  | "card"
  | "support"
  | "managed_device_asset"
  | "unmanaged_device_asset"
  | "application_asset"
  | "access"
  | "mail"
  | "appointment"
  | "article";

export interface SearchResult {
  kind: SearchKind;
  /**
   * The item's — for an Access element, an e-mail, an appointment or an
   * article, its widget's, shared by its elements.
   */
  id: Id;
  /** What the row shows first: the name, the subject, the label. */
  title: string;
  /** Where the item is: the context, the board, the list… */
  context: string;
  /** A widget: the board that carries it, which opens. */
  board_id?: Id;
  /** A link, an appointment, an article: the address, which opens directly. */
  url?: string;
  /** An e-mail, an appointment: what tells it apart in its widget (mailKey…). */
  item?: string;
  /**
   * What is searched besides the title and context, never shown: the
   * description's start, the sender, the address, the last user…
   */
  keywords?: string;
}
