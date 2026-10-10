import type { Category, DeclaredAssetLocation } from "@milo/shared";

// A board's project categories form a tree, as a declared device's locations
// (EditableTree): the same flat places — ids as text — serve to edit them
// (ProjectCategoriesFields) and to pick one in a Cascader (ProjectDrawer).

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
