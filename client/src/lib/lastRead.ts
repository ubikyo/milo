// The last answer a widget read from the server — a weather, a quote, a
// feed — kept to show it at once the next time the widget appears, while
// it rereads: it takes its final height straight away instead of growing
// from a loading line and pushing the elements below.
//
// It lives in the browser (localStorage): it survives reloads and the first
// visit of a board in a new tab. Refused storage — a private window — leaves
// it in memory only.

const PREFIX = "milo.lastRead.";

/** A cache of one widget kind's answers, by key. */
export function lastRead<T>(kind: string) {
  const memory = new Map<string | number, T>();
  const storageKey = (key: string | number) => `${PREFIX}${kind}.${key}`;
  return {
    get(key: string | number): T | undefined {
      if (memory.has(key)) return memory.get(key);
      try {
        const raw = localStorage.getItem(storageKey(key));
        if (!raw) return undefined;
        const value = JSON.parse(raw) as T;
        memory.set(key, value);
        return value;
      } catch {
        return undefined;
      }
    },
    set(key: string | number, value: T) {
      memory.set(key, value);
      try {
        localStorage.setItem(storageKey(key), JSON.stringify(value));
      } catch {
        // Refused or full: memory is enough for this page.
      }
    },
  };
}
