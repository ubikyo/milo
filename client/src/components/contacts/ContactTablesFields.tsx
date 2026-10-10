import { IconCoin, IconFlag, IconReceipt } from "@tabler/icons-react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { CONTACT_CODE_MAX, CONTACT_FIELD_MAX, CONTACT_SYMBOL_MAX } from "@milo/shared";
import type { ContactSettings } from "@milo/shared";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { CopyPasteContext } from "../ui/CopyPasteActions";
import { DrawerRegistrationsContext } from "../ui/IndicatorDrawer";
import { pluralize } from "../ui/DrawerRows";
import { ListRows } from "../ui/EditableRows";
import type { Column } from "../ui/EditableRows";

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

/** Under each list's title: whom it is shared by. */
const scope = (what: string) =>
  `${what} configurées ci-dessous sont communes à l'ensemble des widgets, de type contact, du tableau actuel et uniquement pour ce tableau.`;

export default function ContactTablesFields() {
  const board = useContext(CopyPasteContext);
  const register = useContext(DrawerRegistrationsContext);
  const boardId = board?.board?.id ?? null;
  // A paste from the "Actions" menu may change the board: it is re-read.
  const pastes = board?.pastes ?? 0;

  /** What the server holds, and the draft made from it. */
  const [original, setOriginal] = useState<ContactSettings>(NOTHING);
  const [settings, setSettings] = useState<ContactSettings>(NOTHING);

  const reload = useCallback(async () => {
    if (boardId === null) return;
    try {
      const read = await api.getContactSettings(boardId);
      setOriginal(read);
      setSettings(read);
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [boardId]);

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
    if (!register || boardId === null) return;
    return register(async () => {
      const { original: before, settings: after } = state.current;
      const data: Partial<ContactSettings> = {};
      if (!same(before.payment_terms, after.payment_terms)) data.payment_terms = after.payment_terms;
      if (!same(before.currencies, after.currencies)) data.currencies = after.currencies;
      if (!same(before.countries, after.countries)) data.countries = after.countries;
      if (Object.keys(data).length === 0) return;
      const saved = await api.updateContactSettings(boardId, data);
      setOriginal(saved);
      setSettings(saved);
    });
  }, [register, boardId]);

  if (boardId === null || !register) return null;

  return (
    <>
      <ListRows
        title="Conditions de paiement"
        description={scope("Les conditions de paiement")}
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
      />
      <ListRows
        title="Devises"
        description={scope("Les devises")}
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
      />
      <ListRows
        title="Pays"
        description={`${scope("Les pays")} Le premier est celui d'une nouvelle adresse.`}
        columns={TERM_COLUMNS}
        rows={settings.countries.map((c) => [c.name])}
        save={async (rows) => {
          setSettings((s) => ({ ...s, countries: rows.map(([name = ""]) => ({ name })) }));
          return true;
        }}
        emptyIcon={IconFlag}
        emptyText="Aucun pays"
        addLabel="Ajouter un pays"
        deleteTitle="Supprimer le pays"
        several={(n) => `${n} pays`}
        reorderable
      />
    </>
  );
}
