import { IconCoin, IconReceipt } from "@tabler/icons-react";
import { useListRef } from "../../lib/list-ref";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { CONTACT_CODE_MAX, CONTACT_FIELD_MAX, CONTACT_SETTINGS_DEFAULTS, CONTACT_SYMBOL_MAX } from "@milo/shared";
import type { ContactSettings } from "@milo/shared";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { resetRows } from "../../lib/reset-defaults";
import { CopyPasteContext } from "../ui/CopyPasteActions";
import { DrawerRegistrationsContext } from "../ui/IndicatorDrawer";
import { pluralize } from "../ui/DrawerRows";
import { ListRows } from "../ui/EditableRows";
import type { Column } from "../ui/EditableRows";
import CountryRows from "./CountryRows";

// The open board's contact lists, in the drawer of a Contact widget: the
// payment terms and the currencies a company is given, the countries an
// address is in — the first, a new address's. Like the declared
// assets' lists (DeclaredAssetTablesFields), they are not widget settings
// but board data, shared by all the Contact widgets: they go with
// "Sauvegarder". Each is in its order, dragged by its rows' handles: the
// order its choices follow in a company's drawer.

/** The width of a currency's code and symbol columns. */
const CODE_WIDTH = 80;
const SYMBOL_WIDTH = 70;

const TERM_COLUMNS: Column[] = [{ label: "Libellé", maxLength: CONTACT_FIELD_MAX }];

const CURRENCY_COLUMNS: Column[] = [
  { label: "Libellé", maxLength: CONTACT_FIELD_MAX },
  { label: "Code", maxLength: CONTACT_CODE_MAX, width: CODE_WIDTH },
  { label: "Symbole", maxLength: CONTACT_SYMBOL_MAX, width: SYMBOL_WIDTH, optional: true },
];

/** Nothing read yet. */
const NOTHING: ContactSettings = { payment_terms: [], currencies: [], countries: [] };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export default function ContactTablesFields() {
  const board = useContext(CopyPasteContext);
  const register = useContext(DrawerRegistrationsContext);
  const list = useListRef();
  // A paste from the "Actions" menu may change the board: it is re-read.
  const pastes = board?.pastes ?? 0;

  /** What the server holds, and the draft made from it. */
  const [original, setOriginal] = useState<ContactSettings>(NOTHING);
  const [settings, setSettings] = useState<ContactSettings>(NOTHING);

  const reload = useCallback(async () => {
    if (list === null) return;
    try {
      const read = await api.getContactSettings(list);
      setOriginal(read);
      setSettings(read);
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [list]);

  useEffect(() => {
    void reload();
  }, [reload, pastes]);

  // "Sauvegarder": only the changed lists go, each whole. The server checks
  // them; an error stops the drawer's save, the draft kept.
  const state = useRef({ original, settings });
  useEffect(() => {
    state.current = { original, settings };
  }, [original, settings]);
  useEffect(() => {
    if (!register || list === null) return;
    return register(async () => {
      const { original: before, settings: after } = state.current;
      const data: Partial<ContactSettings> = {};
      if (!same(before.payment_terms, after.payment_terms)) data.payment_terms = after.payment_terms;
      if (!same(before.currencies, after.currencies)) data.currencies = after.currencies;
      if (!same(before.countries, after.countries)) data.countries = after.countries;
      if (Object.keys(data).length === 0) return;
      const saved = await api.updateContactSettings(list, data);
      setOriginal(saved);
      setSettings(saved);
    });
  }, [register, list]);

  if (list === null || !register) return null;

  return (
    <>
      <ListRows
        title="Conditions de paiement"
        columns={TERM_COLUMNS}
        rows={settings.payment_terms.map((t) => [t.name])}
        save={async (rows) => {
          setSettings((s) => ({ ...s, payment_terms: rows.map(([name = ""]) => ({ name })) }));
          return true;
        }}
        emptyIcon={IconReceipt}
        emptyText="Aucune condition de paiement"
        addLabel="Ajouter une condition"
        deleteTitle="Supprimer la condition"
        several={(n) => pluralize(n, "condition")}
        reorderable
        reset={{
          what: "les conditions de paiement",
          onReset: (replace) =>
            setSettings((s) => ({
              ...s,
              payment_terms: resetRows(s.payment_terms, CONTACT_SETTINGS_DEFAULTS.payment_terms, replace),
            })),
        }}
      />
      <ListRows
        title="Devises"
        columns={CURRENCY_COLUMNS}
        rows={settings.currencies.map((c) => [c.name, c.code, c.symbol])}
        save={async (rows) => {
          setSettings((s) => ({
            ...s,
            currencies: rows.map(([name = "", code = "", symbol = ""]) => ({
              name,
              code: code.toUpperCase(),
              symbol,
            })),
          }));
          return true;
        }}
        emptyIcon={IconCoin}
        emptyText="Aucune devise"
        addLabel="Ajouter une devise"
        deleteTitle="Supprimer la devise"
        several={(n) => pluralize(n, "devise")}
        reorderable
        // A currency is matched by its code: its name and symbol come back.
        reset={{
          what: "les devises",
          onReset: (replace) =>
            setSettings((s) => ({
              ...s,
              currencies: resetRows(
                s.currencies,
                CONTACT_SETTINGS_DEFAULTS.currencies,
                replace,
                (a, b) => a.code.trim().toUpperCase() === b.code.trim().toUpperCase(),
              ),
            })),
        }}
      />
      <CountryRows
        value={settings.countries}
        onChange={(countries) => setSettings((s) => ({ ...s, countries }))}
        defaults={CONTACT_SETTINGS_DEFAULTS.countries}
      />
    </>
  );
}
