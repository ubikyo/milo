// What a drawer section's "Réinitialiser" (ResetDefaults) does to its draft:
// the values Milo gives a new widget put back, matched to the existing ones by
// name, case aside. Replacing, only the defaults stay; otherwise the existing
// values stay too, a default one takes back its fields where it is, and the
// defaults missing join the end.

import { withNode } from "../components/ui/EditableTree";

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Rows of a list — a tax, a currency, a country… — with their defaults put
 * back. A matched row keeps its own fields (its id) and takes the default's.
 * "same" tells a default row's match: its name by default — a tax's rate.
 */
export const resetRows = <T extends { name: string }>(
  rows: readonly T[],
  defaults: readonly T[],
  replace: boolean,
  same: (a: T, b: T) => boolean = (a, b) => sameName(a.name, b.name),
): T[] => {
  const matched = new Map<number, T>();
  const reset: T[] = [];
  const missing: T[] = [];
  for (const d of defaults) {
    const i = rows.findIndex((r, n) => !matched.has(n) && same(r, d));
    const row = i === -1 ? { ...d } : { ...rows[i]!, ...d };
    if (i === -1) missing.push(row);
    else matched.set(i, row);
    reset.push(row);
  }
  return replace ? reset : [...rows.map((r, i) => matched.get(i) ?? r), ...missing];
};

interface TreeNode {
  id: string;
  parent: string | null;
  name: string;
}

/**
 * A tree — a categories tree — with its default nodes put back, each by its
 * path, a parent before its children. A matched node keeps its id: what
 * names it still does.
 */
export const resetTree = <N extends TreeNode>(
  nodes: readonly N[],
  paths: readonly (readonly string[])[],
  replace: boolean,
): N[] => {
  const key = (names: readonly string[]) => names.map((n) => n.trim().toLowerCase()).join("\n");
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const pathOf = (node: N): string[] => {
    const names: string[] = [];
    for (let n: N | undefined = node; n; n = n.parent ? byId.get(n.parent) : undefined) {
      names.unshift(n.name);
      if (names.length > nodes.length) break;
    }
    return names;
  };
  const byPath = new Map<string, N>();
  for (const n of nodes) {
    const k = key(pathOf(n));
    if (!byPath.has(k)) byPath.set(k, n);
  }
  const ids = new Map<string, string>();
  const reset: { node: N; existing: boolean }[] = paths.map((path) => {
    const k = key(path);
    const existing = byPath.get(k);
    const parent = path.length > 1 ? (ids.get(key(path.slice(0, -1))) ?? null) : null;
    const name = path[path.length - 1] ?? "";
    const node = (existing ? { ...existing, parent, name } : { id: crypto.randomUUID(), parent, name }) as N;
    ids.set(k, node.id);
    return { node, existing: existing !== undefined };
  });
  if (replace) return reset.map((r) => r.node);
  return reset.filter((r) => !r.existing).reduce((list, r) => withNode(list, r.node), [...nodes]);
};
