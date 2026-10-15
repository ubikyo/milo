import { IconCategory } from "@tabler/icons-react";
import { useListRef } from "../../lib/list-ref";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ProductSettings } from "@milo/shared";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { CopyPasteContext } from "../ui/CopyPasteActions";
import EditableTree from "../ui/EditableTree";
import type { TreeWords } from "../ui/EditableTree";
import { DrawerRegistrationsContext } from "../ui/IndicatorDrawer";

// The open board's product lists, in the drawer of a Produits widget: its
// categories tree, edited as a declared device's locations (EditableTree). Its
// taxes are those of the Taxes widgets it is associated with.
// Like the contacts' lists (ContactTablesFields), it is not a widget setting
// but board data, shared by all the Produits widgets: it goes with
// "Sauvegarder".

const CATEGORY_WORDS: TreeWords = {
  icon: IconCategory,
  none: "Aucune catégorie",
  the: "la catégorie",
  plural: "catégories",
};

/** Nothing read yet. */
const NOTHING: ProductSettings = { categories: [] };

export default function ProductTablesFields() {
  const board = useContext(CopyPasteContext);
  const register = useContext(DrawerRegistrationsContext);
  const list = useListRef();
  // A paste from the "Actions" menu may change the board: it is re-read.
  const pastes = board?.pastes ?? 0;

  /** What the server holds, and the draft made from it. */
  const [original, setOriginal] = useState<ProductSettings>(NOTHING);
  const [settings, setSettings] = useState<ProductSettings>(NOTHING);

  const reload = useCallback(async () => {
    if (list === null) return;
    try {
      const read = await api.getProductSettings(list);
      setOriginal(read);
      setSettings(read);
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [list]);

  useEffect(() => {
    void reload();
  }, [reload, pastes]);

  // "Sauvegarder": the tree goes whole, if it changed. The server checks it;
  // an error stops the drawer's save, the draft kept.
  const state = useRef({ original, settings });
  useEffect(() => {
    state.current = { original, settings };
  }, [original, settings]);
  useEffect(() => {
    if (!register || list === null) return;
    return register(async () => {
      const { original: before, settings: after } = state.current;
      if (JSON.stringify(before) === JSON.stringify(after)) return;
      const saved = await api.updateProductSettings(list, after);
      setOriginal(saved);
      setSettings(saved);
    });
  }, [register, list]);

  if (list === null || !register) return null;

  return (
    <EditableTree
      title="Catégories"
      nodes={settings.categories}
      onChange={(categories) => setSettings((s) => ({ ...s, categories }))}
      words={CATEGORY_WORDS}
    />
  );
}
