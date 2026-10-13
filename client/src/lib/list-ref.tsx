// The list widget being shown or configured (shared, ListRef): its board and
// its key. Its labels, categories, milestone types and tables are its own —
// the board's other widgets of its kind have theirs —: what reads or edits
// them takes it from here.

import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { listKey } from "@milo/shared";
import type { Id, ListRef } from "@milo/shared";
import { CopyPasteContext } from "../components/ui/CopyPasteActions";

export const ListRefContext = createContext<ListRef | null>(null);

/** The list widget around; null outside one, or before it has its key. */
export const useListRef = (): ListRef | null => useContext(ListRefContext);

/** The list widget of this configuration, on the open board. */
export function ProvideListRef({ config, children }: { config: unknown; children: ReactNode }) {
  const boardId = useContext(CopyPasteContext)?.board?.id;
  const key = listKey(config);
  const ref = useMemo(
    () => (boardId != null && key ? { board: boardId, list: key } : null),
    [boardId, key],
  );
  return <ListRefContext.Provider value={ref}>{children}</ListRefContext.Provider>;
}

/** The list widget an item belongs to. */
export const listOf = (item: { board_id: Id; list_key: string }): ListRef => ({
  board: item.board_id,
  list: item.list_key,
});

/** Does this row — a label, a category… — belong to this list widget? */
export const ofList =
  (ref: ListRef | null | undefined) =>
  (row: { board_id?: Id; list_key?: string }): boolean =>
    Boolean(ref) && row.list_key === ref!.list && (row.board_id === undefined || row.board_id === ref!.board);

/** A stable text of a reference, for effect dependencies and cache keys. */
export const listRefKey = (ref: ListRef | null | undefined): string =>
  ref ? `${ref.board}\n${ref.list}` : "";
