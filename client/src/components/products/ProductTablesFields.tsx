import { IconCategory, IconPercentage } from "@tabler/icons-react";
import { useListRef } from "../../lib/list-ref";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { PRODUCT_TAX_MAX } from "@milo/shared";
import type { ProductSettings } from "@milo/shared";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { CopyPasteContext } from "../ui/CopyPasteActions";
import EditableTree from "../ui/EditableTree";
import type { TreeWords } from "../ui/EditableTree";
import { DrawerRegistrationsContext } from "../ui/IndicatorDrawer";
import { pluralize } from "../ui/DrawerRows";
import { ListRows } from "../ui/EditableRows";
import type { Column } from "../ui/EditableRows";

// The open board's product lists, in the drawer of a Produits widget: its
// categories tree, edited as a declared device's locations (EditableTree), and
// its taxes — a rate in percent each, the first a new supplier price's.
// Like the contacts' lists (ContactTablesFields), it is not a widget setting
// but board data, shared by all the Produits widgets: it goes with
// "Sauvegarder".

const CATEGORY_WORDS: TreeWords = {
  icon: IconCategory,
  none: "Aucune catégorie",
  the: "la catégorie",
  plural: "catégories",
};

const DESCRIPTION =
  "Chacune peut en contenir d'autres : Vêtements > Hauts > T-shirts.";

/** A tax's rate: a percentage, to the hundredth, a comma or a point. */
const TAX_COLUMNS: Column[] = [
  {
    label: "Taux",
    maxLength: 6,
    suffix: "%",
    pattern: /^\d{1,3}([.,]\d{1,2})?$/,
    invalid: (v) => `« ${v} » n'est pas un pourcentage entre 0 et ${PRODUCT_TAX_MAX}`,
  },
];

/** Nothing read yet. */
const NOTHING: ProductSettings = { categories: [], taxes: [] };

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
    <>
      <EditableTree
        title="Catégories"
        description={DESCRIPTION}
        nodes={settings.categories}
        onChange={(categories) => setSettings((s) => ({ ...s, categories }))}
        words={CATEGORY_WORDS}
      />
      <ListRows
        title="Taxes"
        columns={TAX_COLUMNS}
        rows={settings.taxes.map((t) => [String(t.rate).replace(".", ",")])}
        save={async (rows) => {
          const rates = rows.map(([rate = ""]) => Number(rate.replace(",", ".")));
          if (rates.some((r) => r > PRODUCT_TAX_MAX)) {
            notifyError(`Un taux tient entre 0 et ${PRODUCT_TAX_MAX} %`);
            return false;
          }
          if (new Set(rates).size < rates.length) {
            notifyError("Un même taux figure deux fois");
            return false;
          }
          setSettings((s) => ({ ...s, taxes: rates.map((rate) => ({ rate })) }));
          return true;
        }}
        emptyIcon={IconPercentage}
        emptyText="Aucune taxe"
        addLabel="Ajouter une taxe"
        deleteTitle="Supprimer la taxe"
        several={(n) => pluralize(n, "taxe")}
        nameOf={(row) => `${row[0] ?? ""} %`}
        reorderable
      />
    </>
  );
}
