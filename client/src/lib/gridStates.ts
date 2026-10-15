// The sort and search of the grids, kept for the signed-in person: a grid
// comes back as they left it — after a reload, on another browser. Each
// widget keeps its own: the board gives its grids their scope
// ("widget:<id>", GridScope).
//
// Read once, when the first grid mounts; each change is saved a moment
// later, the whole scope at once. What comes back is checked by the grid
// ("read"): a column may have gone since.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Id } from "@milo/shared";
import { api } from "../api";
import { getToken } from "./auth";

type State = Record<string, unknown>;

/** The grid of a board's widget: set by the board around each one. */
export const GridScope = createContext<string | null>(null);

export const widgetScope = (id: Id): string => `widget:${id}`;

let states: Record<string, State> = {};
let status: "unread" | "reading" | "read" = "unread";
/** Scopes changed before the read came back: they keep what was just chosen. */
const changed = new Set<string>();
const subscribers = new Set<() => void>();
const pending = new Map<string, ReturnType<typeof setTimeout>>();

/** A search typed letter by letter is saved once, when the typing stops. */
const SAVE_DELAY = 600;

const notify = () => {
  for (const subscriber of subscribers) subscriber();
};

const subscribe = (subscriber: () => void) => {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
};

const load = () => {
  // Signed out — the page before the sign-in —: the first grid after it reads them.
  if (status !== "unread" || !getToken()) return;
  status = "reading";
  api
    .getGridStates()
    .then((found) => {
      const kept = Object.fromEntries([...changed].map((scope) => [scope, states[scope] ?? {}]));
      states = { ...found, ...kept };
      changed.clear();
      status = "read";
      notify();
    })
    .catch(() => {
      // The grids start from their defaults; the next one to mount tries again.
      status = "unread";
    });
};

const save = (scope: string) => {
  pending.delete(scope);
  api.saveGridState(scope, states[scope] ?? {}).catch(() => {
    // Not saved: the grid holds for this page.
  });
};

const flush = () => {
  for (const [scope, timer] of pending) {
    clearTimeout(timer);
    save(scope);
  }
};

// Leaving the page: what was waiting goes now.
if (typeof window !== "undefined") window.addEventListener("pagehide", flush);

const write = (scope: string, part: string, value: unknown) => {
  const { [part]: _previous, ...others } = states[scope] ?? {};
  states = { ...states, [scope]: value === undefined ? others : { ...others, [part]: value } };
  if (status !== "read") changed.add(scope);
  notify();
  clearTimeout(pending.get(scope));
  pending.set(scope, setTimeout(() => save(scope), SAVE_DELAY));
};

/**
 * On sign-out: what was waiting is saved while the session still holds, and
 * the next person starts from their own grids.
 */
export const forgetGridStates = () => {
  flush();
  states = {};
  status = "unread";
  changed.clear();
  notify();
};

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * A grid's state, as "useState" holds it, but kept for the person: "part"
 * names it in its grid's scope ("sort", "filters"...), "read" checks what
 * comes back — "undefined" when it no longer fits, and the grid starts from
 * "initial". The scope is the widget's (GridScope); outside a widget, the
 * state lives in the page only.
 */
export function useGridState<T>(
  part: string,
  initial: T,
  read: (stored: unknown) => T | undefined,
): [T, Dispatch<SetStateAction<T>>] {
  const where = useContext(GridScope);
  const [first] = useState(initial);
  const [local, setLocal] = useState(initial);
  // For the changes, made outside the render.
  const readRef = useRef(read);
  useEffect(() => {
    readRef.current = read;
  });

  useEffect(() => {
    if (where) load();
  }, [where]);

  const stored = useSyncExternalStore(subscribe, () => (where ? states[where]?.[part] : undefined));
  // Checked once per stored value: a new object at each render would run
  // the grid's sort again. "read" only depends on the grid, which stays.
  const value = useMemo(
    () => (stored === undefined ? first : (read(stored) ?? first)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stored, first],
  );

  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      if (!where) {
        setLocal(next);
        return;
      }
      // From what is stored, not from the render: two changes in a row add up.
      const kept = states[where]?.[part];
      const current = kept === undefined ? first : (readRef.current(kept) ?? first);
      const computed = typeof next === "function" ? (next as (previous: T) => T)(current) : next;
      write(where, part, same(computed, first) ? undefined : computed);
    },
    [where, part, first],
  );

  return [where ? value : local, set];
}

// --- What comes back, checked ----------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** A sort on one of these columns — and, for the labels, a group. */
export const readSort =
  <S extends { key: string; direction: "asc" | "desc"; group?: Id }>(keys: readonly string[]) =>
  (stored: unknown): S | undefined => {
    if (!isRecord(stored)) return undefined;
    const { key, direction, group } = stored;
    if (typeof key !== "string" || !keys.includes(key)) return undefined;
    if (direction !== "asc" && direction !== "desc") return undefined;
    if (group !== undefined && typeof group !== "number") return undefined;
    return { key, direction, ...(group !== undefined ? { group } : {}) } as S;
  };

/** Filters of these keys: the others, gone since, are dropped. */
export const readFilters =
  <F extends { [K in keyof F]: string }>(defaults: F) =>
  (stored: unknown): F | undefined => {
    if (!isRecord(stored)) return undefined;
    const kept = Object.fromEntries(
      Object.entries(stored).filter(([key, value]) => key in defaults && typeof value === "string"),
    );
    return { ...defaults, ...kept };
  };

/** Texts by key, of these keys if given. */
export const readTexts =
  <K extends string>(keys?: readonly string[]) =>
  (stored: unknown): Partial<Record<K, string>> | undefined => {
    if (!isRecord(stored)) return undefined;
    return Object.fromEntries(
      Object.entries(stored).filter(
        ([key, value]) => typeof value === "string" && (!keys || keys.includes(key)),
      ),
    ) as Partial<Record<K, string>>;
  };

/** One of these texts. */
export const readChoice =
  <C extends string>(choices?: readonly string[]) =>
  (stored: unknown): C | undefined =>
    typeof stored === "string" && (!choices || choices.includes(stored)) ? (stored as C) : undefined;
