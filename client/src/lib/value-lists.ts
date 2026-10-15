// The items of the Liste widgets (shared, value-lists.ts): a Liste widget
// shows its own; a compatible widget offers those of the Liste widgets it
// names (VALUE_SOURCES), of any board one sees — a choice keeps the item's id
// and shows its name. Each re-reads when the server says they changed
// (App.tsx).

import { useCallback, useEffect, useMemo, useState } from "react";
import { VALUE_LIST_TYPE, VALUE_SOURCES } from "@milo/shared";
import type { ComboboxItem } from "@mantine/core";
import type { ListRef, ValueItem } from "@milo/shared";
import { api } from "../api";
import { errorMessage, notifyError } from "./errors";
import { listRefKey } from "./list-ref";
import { onResources, useSources } from "./sources";

/** A Liste widget's items, "null" while they are read. */
export function useValueItems(ref: ListRef | null) {
  const [items, setItems] = useState<ValueItem[] | null>(null);
  const key = listRefKey(ref);

  const reload = useCallback(async () => {
    if (!ref) return;
    try {
      setItems(await api.getValueItems(ref));
    } catch (e) {
      notifyError(errorMessage(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    void reload();
    return onResources(["value-lists"], () => void reload());
  }, [reload]);

  return { items, setItems };
}

/**
 * The items a widget offers, as a choice's options: the item's id for the
 * value, its name for the label — those of the Liste widgets its
 * configuration names (VALUE_SOURCES), in their order, an id once. Empty while
 * they are read, or without one.
 */
export function useOfferedValues(config: unknown, field: string = VALUE_SOURCES): ComboboxItem[] {
  const sources = useSources(VALUE_LIST_TYPE, config, field);
  const key = sources.map((s) => `${s.board_id}\n${s.key}`).join("|");
  const [read, setRead] = useState<ValueItem[][]>([]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      Promise.all(sources.map((s) => api.getValueItems({ board: s.board_id, list: s.key })))
        .then((lists) => alive && setRead(lists))
        .catch((e) => notifyError(errorMessage(e)));
    setRead([]);
    void load();
    const stop = onResources(["value-lists"], () => void load());
    return () => {
      alive = false;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return useMemo(() => {
    const seen = new Set<string>();
    return read
      .flat()
      .filter((i) => !seen.has(i.id) && Boolean(seen.add(i.id)))
      .map((i) => ({ value: i.id, label: i.name }));
  }, [read]);
}
