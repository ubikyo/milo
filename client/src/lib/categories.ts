import type { Category, DeclaredAssetLocation, Id, ListRef } from "@milo/shared";
import { api } from "../api";

// A board's project categories form a tree, as a declared device's locations
// (EditableTree): the same flat places — ids as text — serve to edit them
// (ProjectCategoriesFields, ProjectCategoriesModal) and to pick one in a
// Cascader (ProjectDrawer).

/**
 * The categories as the tree's places, a parent always before its children,
 * siblings in their order. One whose parent is missing counts as a root.
 */
export const categoryNodes = (categories: Category[]): DeclaredAssetLocation[] => {
  const ids = new Set(categories.map((c) => c.id));
  const parentOf = (c: Category) =>
    c.parent_id !== null && ids.has(c.parent_id) ? String(c.parent_id) : null;
  const nodes: DeclaredAssetLocation[] = [];
  const visit = (parent: string | null) => {
    for (const c of categories) {
      if (parentOf(c) !== parent) continue;
      nodes.push({ id: String(c.id), parent, name: c.name });
      visit(String(c.id));
    }
  };
  visit(null);
  return nodes;
};

type Node = DeclaredAssetLocation;

/** A place and all those under it, by their ids. */
const subtreeOf = (nodes: Node[], id: string): Set<string> => {
  const inside = new Set([id]);
  for (const node of nodes) if (node.parent && inside.has(node.parent)) inside.add(node.id);
  return inside;
};

/**
 * The categories a change of the tree would remove although they still file
 * projects: the server would refuse it on saving.
 */
export const usedRemoved = (originals: Category[], nodes: Node[], next: Node[]): Category[] => {
  const kept = new Set(next.map((n) => n.id));
  const byId = new Map(originals.map((c) => [String(c.id), c]));
  return nodes
    .filter((n) => !kept.has(n.id))
    .map((n) => byId.get(n.id))
    .filter((c): c is Category => Boolean(c?.project_count));
};

/**
 * A tree's draft written to the server: the removed categories whose whole
 * subtree goes, the new ones — a parent before its children —, those renamed
 * or moved, the other removed ones — freed of what moved out of them —, then
 * the order. An empty name stops everything before the first send.
 *
 * Returns each place's category on the server: the new ones once created.
 */
export async function saveCategoryTree(
  list: ListRef,
  before: Category[],
  after: Node[],
): Promise<Map<string, Id>> {
  if (after.some((n) => !n.name.trim())) {
    throw new Error("Catégories : chacune demande un nom.");
  }
  const beforeNodes = categoryNodes(before);
  const kept = new Set(after.map((n) => n.id));
  // The deepest first: a parent goes once its children are gone.
  const removed = beforeNodes.filter((n) => !kept.has(n.id)).reverse();
  const whole = removed.filter((n) => [...subtreeOf(beforeNodes, n.id)].every((id) => !kept.has(id)));
  for (const n of whole) await api.deleteCategory(Number(n.id));
  const real = new Map<string, Id>(before.map((c) => [String(c.id), c.id]));
  const byId = new Map(before.map((c) => [String(c.id), c]));
  for (const n of after) {
    const name = n.name.trim();
    const parent = n.parent === null ? null : real.get(n.parent)!;
    const original = byId.get(n.id);
    if (!original) {
      real.set(n.id, (await api.createCategory(list, name, parent)).id);
    } else if (original.name !== name || original.parent_id !== parent) {
      await api.updateCategory(original.id, { name, parent_id: parent });
    }
  }
  for (const n of removed) {
    if (!whole.includes(n)) await api.deleteCategory(Number(n.id));
  }
  const ids = after.map((n) => real.get(n.id)!);
  const order = beforeNodes.filter((n) => kept.has(n.id)).map((n) => Number(n.id));
  const sameOrder = ids.length === order.length && ids.every((id, i) => id === order[i]);
  if (!sameOrder) await api.reorderCategories(list, ids);
  return real;
}
