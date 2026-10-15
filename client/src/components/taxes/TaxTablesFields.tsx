import { IconPercentage } from "@tabler/icons-react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { TAX_DEFAULTS, TAX_NAME_MAX, TAX_RATE_MAX } from "@milo/shared";
import type { Tax } from "@milo/shared";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { resetRows } from "../../lib/reset-defaults";
import { useListRef } from "../../lib/list-ref";
import { CopyPasteContext } from "../ui/CopyPasteActions";
import { pluralize } from "../ui/DrawerRows";
import { ListRows } from "../ui/EditableRows";
import type { Column } from "../ui/EditableRows";
import { DrawerRegistrationsContext } from "../ui/IndicatorDrawer";

// A Taxes widget's taxes, in its drawer: an editable list, in its order —
// dragged by their handle —, a name and a rate each. Not widget settings but
// its own data, as an Entrepôts widget's countries (WarehouseTablesFields):
// they go with "Sauvegarder".

/** A tax's name, optional, and its rate: a percentage, to the hundredth, a comma or a point. */
const COLUMNS: Column[] = [
  { label: "Nom", maxLength: TAX_NAME_MAX, optional: true },
  {
    label: "Taxe",
    width: 100,
    maxLength: 6,
    suffix: "%",
    pattern: /^\d{1,3}([.,]\d{1,2})?$/,
    invalid: (v) => `« ${v} » n'est pas un pourcentage entre 0 et ${TAX_RATE_MAX}`,
  },
];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export default function TaxTablesFields() {
  const board = useContext(CopyPasteContext);
  const register = useContext(DrawerRegistrationsContext);
  const list = useListRef();
  // A paste from the "Actions" menu may change the board: it is re-read.
  const pastes = board?.pastes ?? 0;

  /** What the server holds, and the draft made from it. */
  const [original, setOriginal] = useState<Tax[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);

  const reload = useCallback(async () => {
    if (list === null) return;
    try {
      const read = await api.getTaxes(list);
      setOriginal(read);
      setTaxes(read);
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [list]);

  useEffect(() => {
    void reload();
  }, [reload, pastes]);

  // "Sauvegarder": the list goes whole, if it changed. The server checks it;
  // an error stops the drawer's save, the draft kept.
  const state = useRef({ original, taxes });
  useEffect(() => {
    state.current = { original, taxes };
  }, [original, taxes]);
  useEffect(() => {
    if (!register || list === null) return;
    return register(async () => {
      const { original: before, taxes: after } = state.current;
      if (same(before, after)) return;
      const saved = await api.updateTaxes(list, after);
      setOriginal(saved);
      setTaxes(saved);
    });
  }, [register, list]);

  if (list === null || !register) return null;

  return (
    <ListRows
      title="Taxes"
      header
      columns={COLUMNS}
      rows={taxes.map((t) => [t.name, String(t.rate).replace(".", ",")])}
      save={async (rows) => {
        const list = rows.map(([name = "", rate = ""]) => ({
          name: name.trim(),
          rate: Number(rate.replace(",", ".")),
        }));
        if (list.some((t) => t.rate > TAX_RATE_MAX)) {
          notifyError(`Un taux tient entre 0 et ${TAX_RATE_MAX} %`);
          return false;
        }
        if (new Set(list.map((t) => t.rate)).size < list.length) {
          notifyError("Un même taux figure deux fois");
          return false;
        }
        setTaxes(list);
        return true;
      }}
      emptyIcon={IconPercentage}
      emptyText="Aucune taxe"
      addLabel="Ajouter une taxe"
      deleteTitle="Supprimer la taxe"
      several={(n) => pluralize(n, "taxe")}
      nameOf={(row) => row[0] || `${row[1] ?? ""} %`}
      reorderable
      // A tax is matched by its rate — one per rate —: its name comes back.
      reset={{
        what: "les taxes",
        onReset: (replace) => setTaxes((before) => resetRows(before, TAX_DEFAULTS, replace, (a, b) => a.rate === b.rate)),
      }}
    />
  );
}
