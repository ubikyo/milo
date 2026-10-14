import { notifications } from "@mantine/notifications";
import { useListRef } from "../../lib/list-ref";
import { IconCategory } from "@tabler/icons-react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Category, DeclaredAssetLocation, ListRef } from "@milo/shared";
import { api } from "../../api";
import { categoryNodes, saveCategoryTree, usedRemoved } from "../../lib/categories";
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

export const CATEGORY_WORDS: TreeWords = {
  icon: IconCategory,
  none: "Aucune catégorie",
  the: "la catégorie",
  plural: "catégories",
};

type Node = DeclaredAssetLocation;

/**
 * A "Projets" widget's categories as the server holds them, and the tree's
 * draft made from them — here, and in the window a project's details open
 * (ProjectCategoriesModal). "reread" changes: they are read again.
 */
export function useCategoryDraft(list: ListRef | null, reread: unknown = null) {
  /** What the server holds, and the draft made from it. */
  const [originals, setOriginals] = useState<Category[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);

  const reload = useCallback(async () => {
    if (list === null) return;
    try {
      const read = await api.getCategories(list);
      setOriginals(read);
      setNodes(categoryNodes(read));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [list]);

  useEffect(() => {
    void reload();
  }, [reload, reread]);

  /**
   * A change of the tree, unless it removes a category that still files
   * projects: the server would refuse it on saving. The tree stays as it was.
   */
  const change = (next: Node[]) => {
    const used = usedRemoved(originals, nodes, next);
    for (const c of used) {
      notifications.show({
        color: "orange",
        title: "Suppression impossible",
        message: `« ${c.name} » range encore ${c.project_count} projet${c.project_count! > 1 ? "s" : ""}.`,
      });
    }
    if (used.length === 0) setNodes(next);
  };

  return { originals, nodes, change, reload };
}

export default function ProjectCategoriesFields() {
  const board = useContext(CopyPasteContext);
  const register = useContext(DrawerRegistrationsContext);
  const list = useListRef();
  // A paste from the "Actions" menu changes the categories: they are re-read.
  const { originals, nodes, change, reload } = useCategoryDraft(list, board?.pastes ?? 0);

  // "Sauvegarder": the draft goes to the server (saveCategoryTree).
  const state = useRef({ originals, nodes });
  state.current = { originals, nodes };
  useEffect(() => {
    if (!register || list === null) return;
    return register(async () => {
      const { originals: before, nodes: after } = state.current;
      try {
        await saveCategoryTree(list, before, after);
      } finally {
        // What was removed is gone: the tree restarts from the server, even
        // after an error.
        await reload();
      }
    });
  }, [register, list, reload]);

  if (list === null || !register) return null;

  return (
    <EditableTree
      title="Catégories"
      nodes={nodes}
      onChange={change}
      words={CATEGORY_WORDS}
    />
  );
}
