import { notifications } from "@mantine/notifications";
import { IconCategory } from "@tabler/icons-react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Category, DeclaredAssetLocation, Id } from "@milo/shared";
import { api } from "../../api";
import { categoryNodes } from "../../lib/categories";
import { errorMessage, notifyError } from "../../lib/errors";
import { CopyPasteContext } from "../ui/CopyPasteActions";
import EditableTree from "../ui/EditableTree";
import type { TreeWords } from "../ui/EditableTree";
import { DrawerRegistrationsContext } from "../ui/IndicatorDrawer";

// The open board's project categories, in the drawer of a "Projets" widget:
// a tree — "Interne > Informatique > Réseau" —, edited as a Produits widget's
// categories (ProductTablesFields). They are not widget settings but board
// data: nothing is sent before "Sauvegarder" (DrawerRegistrationsContext),
// and "Fermer" leaves everything as before.
//
// Each category is a row of the server: on saving, the tree is compared with
// what it holds — what was removed, what is new, what was renamed or moved,
// then the order. A category that still files projects cannot be removed: the
// tree refuses it at once, and says so.

const CATEGORY_WORDS: TreeWords = {
  icon: IconCategory,
  none: "Aucune catégorie",
  the: "la catégorie",
  plural: "catégories",
};

const DESCRIPTION =
  "Les catégories configurées ci-dessous sont communes à l'ensemble des widgets, de type projet, du tableau actuel et uniquement pour ce tableau. Chacune peut en contenir d'autres : Interne > Informatique > Réseau.";

type Node = DeclaredAssetLocation;

/** The categories by their place's id. */
const byIdOf = (categories: Category[]) => new Map(categories.map((c) => [String(c.id), c]));

/** A place and all those under it, by their ids. */
const subtreeOf = (nodes: Node[], id: string): Set<string> => {
  const inside = new Set([id]);
  for (const node of nodes) if (node.parent && inside.has(node.parent)) inside.add(node.id);
  return inside;
};

export default function ProjectCategoriesFields() {
  const board = useContext(CopyPasteContext);
  const register = useContext(DrawerRegistrationsContext);
  const boardId = board?.board?.id ?? null;
  // A paste from the "Actions" menu changes the categories: they are re-read.
  const pastes = board?.pastes ?? 0;

  /** What the server holds, and the draft made from it. */
  const [originals, setOriginals] = useState<Category[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);

  const reload = useCallback(async () => {
    if (boardId === null) return;
    try {
      const read = await api.getCategories(String(boardId));
      setOriginals(read);
      setNodes(categoryNodes(read));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [boardId]);

  useEffect(() => {
    void reload();
  }, [reload, pastes]);

  /**
   * A change of the tree, unless it removes a category that still files
   * projects: the server would refuse it on saving. The tree stays as it was.
   */
  const change = (next: Node[]) => {
    const kept = new Set(next.map((n) => n.id));
    const byId = byIdOf(originals);
    const used = nodes
      .filter((n) => !kept.has(n.id))
      .map((n) => byId.get(n.id))
      .filter((c): c is Category => Boolean(c?.project_count));
    for (const c of used) {
      notifications.show({
        color: "orange",
        title: "Suppression impossible",
        message: `« ${c.name} » range encore ${c.project_count} projet${c.project_count! > 1 ? "s" : ""}.`,
      });
    }
    if (used.length === 0) setNodes(next);
  };

  // "Sauvegarder": the removed categories whose whole subtree goes, the new
  // ones — a parent before its children —, those renamed or moved, the other
  // removed ones — freed of what moved out of them —, then the order. An
  // empty name stops everything before the first send.
  const state = useRef({ originals, nodes });
  state.current = { originals, nodes };
  useEffect(() => {
    if (!register || boardId === null) return;
    return register(async () => {
      const { originals: before, nodes: after } = state.current;
      if (after.some((n) => !n.name.trim())) {
        throw new Error("Catégories : chacune demande un nom.");
      }
      const beforeNodes = categoryNodes(before);
      const kept = new Set(after.map((n) => n.id));
      // The deepest first: a parent goes once its children are gone.
      const removed = beforeNodes.filter((n) => !kept.has(n.id)).reverse();
      const whole = removed.filter((n) => [...subtreeOf(beforeNodes, n.id)].every((id) => !kept.has(id)));
      try {
        for (const n of whole) await api.deleteCategory(Number(n.id));
        /** Each place's category on the server: new ones once created. */
        const real = new Map<string, Id>(before.map((c) => [String(c.id), c.id]));
        const byId = byIdOf(before);
        for (const n of after) {
          const name = n.name.trim();
          const parent = n.parent === null ? null : real.get(n.parent)!;
          const original = byId.get(n.id);
          if (!original) {
            real.set(n.id, (await api.createCategory(boardId, name, parent)).id);
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
        if (!sameOrder) await api.reorderCategories(boardId, ids);
      } finally {
        // What was removed is gone: the tree restarts from the server, even
        // after an error.
        await reload();
      }
    });
  }, [register, boardId, reload]);

  if (boardId === null || !register) return null;

  return (
    <EditableTree
      title="Catégories"
      description={DESCRIPTION}
      nodes={nodes}
      onChange={change}
      words={CATEGORY_WORDS}
    />
  );
}
