import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { WAREHOUSE_SETTINGS_DEFAULTS } from "@milo/shared";
import type { WarehouseSettings } from "@milo/shared";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { useListRef } from "../../lib/list-ref";
import CountryRows from "../contacts/CountryRows";
import { CopyPasteContext } from "../ui/CopyPasteActions";
import { DrawerRegistrationsContext } from "../ui/IndicatorDrawer";

// An Entrepôts widget's lists, in its drawer: the countries a warehouse's
// address is in — the first, a new warehouse's —, as a Contact widget's
// (ContactTablesFields). Not widget settings but its own data: they go with
// "Sauvegarder".

/** Nothing read yet. */
const NOTHING: WarehouseSettings = { countries: [] };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export default function WarehouseTablesFields() {
  const board = useContext(CopyPasteContext);
  const register = useContext(DrawerRegistrationsContext);
  const list = useListRef();
  // A paste from the "Actions" menu may change the board: it is re-read.
  const pastes = board?.pastes ?? 0;

  /** What the server holds, and the draft made from it. */
  const [original, setOriginal] = useState<WarehouseSettings>(NOTHING);
  const [settings, setSettings] = useState<WarehouseSettings>(NOTHING);

  const reload = useCallback(async () => {
    if (list === null) return;
    try {
      const read = await api.getWarehouseSettings(list);
      setOriginal(read);
      setSettings(read);
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [list]);

  useEffect(() => {
    void reload();
  }, [reload, pastes]);

  // "Sauvegarder": the list goes whole, if it changed. The server checks it;
  // an error stops the drawer's save, the draft kept.
  const state = useRef({ original, settings });
  useEffect(() => {
    state.current = { original, settings };
  }, [original, settings]);
  useEffect(() => {
    if (!register || list === null) return;
    return register(async () => {
      const { original: before, settings: after } = state.current;
      if (same(before.countries, after.countries)) return;
      const saved = await api.updateWarehouseSettings(list, { countries: after.countries });
      setOriginal(saved);
      setSettings(saved);
    });
  }, [register, list]);

  if (list === null || !register) return null;

  return (
    <CountryRows
      value={settings.countries}
      onChange={(countries) => setSettings((s) => ({ ...s, countries }))}
      defaults={WAREHOUSE_SETTINGS_DEFAULTS.countries}
    />
  );
}
