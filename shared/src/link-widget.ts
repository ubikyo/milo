// The addresses a Link widget holds, read the same way by the column, the
// task it starts and the search (server, routes/search.ts).
//
// A widget long held a single link, in "label" and "url" at the root of its
// configuration. It now holds a list, "links", in the order the column shows
// them. A configuration from before has no list: its single link is read as
// the list's only entry, and the first change rewrites it as a list.

/** The key of the list in the configuration. */
export const LINKS = "links";

/**
 * Where a link opens: "self", the page itself; "blank", another page; "off",
 * nowhere — switched off, it keeps its address but no longer shows once the
 * category is locked.
 */
export type LinkOpening = "off" | "self" | "blank";

const OPENINGS: readonly LinkOpening[] = ["off", "self", "blank"];

/** A link: the word that designates it, its address, and where it opens. */
export interface LinkEntry {
  label: string;
  url: string;
  opening: LinkOpening;
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** The links of a Link widget, in order. */
export const linkEntries = (config: unknown): LinkEntry[] => {
  const c = (config ?? {}) as Record<string, unknown>;
  // The opening was once the widget's, with a switch beside it: a link that
  // names none takes it from there — another page by default.
  const shared: LinkOpening = c.enabled === false ? "off" : c.opening === "self" ? "self" : "blank";
  const openingOf = (value: unknown): LinkOpening =>
    OPENINGS.includes(value as LinkOpening) ? (value as LinkOpening) : shared;
  const list = c[LINKS];
  if (Array.isArray(list)) {
    return list.map((l) => {
      const entry = (l ?? {}) as Record<string, unknown>;
      return { label: text(entry.label), url: text(entry.url), opening: openingOf(entry.opening) };
    });
  }
  return [{ label: text(c.label), url: text(c.url), opening: shared }];
};

/**
 * The configuration with these links: what the widget held for a single link
 * before — its label, address, opening and switch — leaves the root, each link
 * now carrying its own.
 */
export const withLinks = (config: unknown, links: LinkEntry[]): Record<string, unknown> => {
  const {
    label: _label,
    url: _url,
    opening: _opening,
    enabled: _enabled,
    ...rest
  } = (config ?? {}) as Record<string, unknown>;
  return { ...rest, [LINKS]: links };
};
