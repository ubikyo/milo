import { useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { DECLARED_ASSET_EXTRA_LISTS, DECLARED_ASSET_NAME_MAX } from "@milo/shared";
import type {
  DeclaredAssetEntry,
  DeclaredAssetKind,
  DeclaredAssetNoun,
  DeclaredAssetSettings,
} from "@milo/shared";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { CopyPasteContext } from "../ui/CopyPasteActions";
import { DrawerRegistrationsContext } from "../ui/IndicatorDrawer";
import { pluralize } from "../ui/DrawerRows";
import { ListRows } from "../ui/EditableRows";
import EditableTree from "../ui/EditableTree";
import type { Column, Row } from "../ui/EditableRows";
import {
  DECLARED_ASSET_LOOKS,
  DECLARED_ASSET_SUPPLIER,
  EXTRA_ENTRY_LISTS,
  LOCATIONS_LOOK,
  SUPPLIER_ICON,
  agreement,
  capitalized,
  listDescription,
  usedBy,
} from "./kinds";

// The open board's lists of one declared asset kind, in the drawer of its
// widget: categories, suppliers, makers, and products — each of a category
// and a maker —, in the kind's words: device types, brands and models;
// software types, publishers and applications. Like the managed device
// asset tables (ManagedDeviceAssetTablesFields), they are not widget settings
// but board data, shared by all the kind's widgets: they go with
// "Sauvegarder".
//
// A product names its category and its maker: renaming one renames it in its
// products, and one still named by a product cannot be deleted. Some kinds
// have more lists, after those: a device's identification types and its
// locations — a tree (EditableTree) —, an application's license information
// types.

/** The width of the category and maker columns, in the products list. */
const CHOICE_WIDTH = 140;

const NAME_COLUMNS: Column[] = [{ label: "Nom", maxLength: DECLARED_ASSET_NAME_MAX }];

/** Nothing recorded yet. */
const NOTHING: DeclaredAssetSettings = { categories: [], suppliers: [], makers: [], products: [] };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const entries = (list: Row[]): DeclaredAssetEntry[] => list.map(([name = ""]) => ({ name }));

export default function DeclaredAssetTablesFields({ kind }: { kind: DeclaredAssetKind }) {
  const look = DECLARED_ASSET_LOOKS[kind];
  const { category, maker, product } = look.words;
  const board = useContext(CopyPasteContext);
  const register = useContext(DrawerRegistrationsContext);
  const boardId = board?.board?.id ?? null;
  // A paste from the "Actions" menu may change the board: it is re-read.
  const pastes = board?.pastes ?? 0;

  /** What the server holds, and the draft made from it. */
  const [original, setOriginal] = useState<DeclaredAssetSettings>(NOTHING);
  const [settings, setSettings] = useState<DeclaredAssetSettings>(NOTHING);

  const reload = useCallback(async () => {
    if (boardId === null) return;
    try {
      const read = await api.getDeclaredAssetSettings(kind, boardId);
      setOriginal(read);
      setSettings(read);
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [kind, boardId]);

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
      const data: Partial<DeclaredAssetSettings> = {};
      if (!same(before.categories, after.categories)) data.categories = after.categories;
      if (!same(before.suppliers, after.suppliers)) data.suppliers = after.suppliers;
      if (!same(before.makers, after.makers)) data.makers = after.makers;
      if (!same(before.products, after.products)) data.products = after.products;
      for (const list of DECLARED_ASSET_EXTRA_LISTS[kind]) {
        if (!same(before[list], after[list])) Object.assign(data, { [list]: after[list] });
      }
      if (Object.keys(data).length === 0) return;
      const saved = await api.updateDeclaredAssetSettings(kind, boardId, data);
      setOriginal(saved);
      setSettings(saved);
    });
  }, [register, kind, boardId]);

  if (boardId === null || !register) return null;

  /**
   * A list the products name changes — categories, makers —: a renamed entry
   * — same place, another name — is renamed in its products; one still named
   * by a product stays.
   */
  const saveNamed = async (
    key: "categories" | "makers",
    field: "category" | "maker",
    noun: DeclaredAssetNoun,
    list: Row[],
  ): Promise<boolean> => {
    const next = entries(list);
    const before = settings[key];
    const renamed = new Map<string, string>();
    if (next.length === before.length) {
      before.forEach((e, i) => {
        const after = next[i]?.name;
        if (after && after !== e.name) renamed.set(e.name, after);
      });
    }
    const kept = new Set(next.map((e) => e.name));
    const orphan = settings.products.find((p) => !kept.has(p[field]) && !renamed.has(p[field]));
    if (orphan) {
      notifyError(`${usedBy(noun, orphan[field])} par ${product.the} « ${orphan.name} »`);
      return false;
    }
    setSettings((s) => ({
      ...s,
      [key]: next,
      products: s.products.map((p) => ({ ...p, [field]: renamed.get(p[field]) ?? p[field] })),
    }));
    return true;
  };

  /** The lists made of names alone, in the order the drawer shows them. */
  const nameLists: {
    key: "categories" | "suppliers" | "makers";
    noun: DeclaredAssetNoun;
    icon: ComponentType<{ size?: number }>;
    save: (list: Row[]) => Promise<boolean>;
  }[] = [
    {
      key: "categories",
      noun: category,
      icon: look.categoryIcon,
      save: (list) => saveNamed("categories", "category", category, list),
    },
    {
      key: "suppliers",
      noun: DECLARED_ASSET_SUPPLIER,
      icon: SUPPLIER_ICON,
      save: async (list) => {
        setSettings((s) => ({ ...s, suppliers: entries(list) }));
        return true;
      },
    },
    {
      key: "makers",
      noun: maker,
      icon: look.makerIcon,
      save: (list) => saveNamed("makers", "maker", maker, list),
    },
  ];

  // The category and the maker, chosen among the board's, then the product's name.
  const productColumns: Column[] = [
    {
      label: category.title,
      maxLength: DECLARED_ASSET_NAME_MAX,
      width: CHOICE_WIDTH,
      options: settings.categories.map((c) => c.name),
    },
    {
      label: maker.title,
      maxLength: DECLARED_ASSET_NAME_MAX,
      width: CHOICE_WIDTH,
      options: settings.makers.map((m) => m.name),
    },
    { label: product.title, maxLength: DECLARED_ASSET_NAME_MAX },
  ];

  return (
    <>
      {nameLists.map((l) => (
        <ListRows
          key={l.key}
          title={l.noun.titles}
          description={listDescription(l.noun, look.scope)}
          columns={NAME_COLUMNS}
          rows={settings[l.key].map((e) => [e.name])}
          save={l.save}
          emptyIcon={l.icon}
          emptyText={l.noun.none}
          addLabel={`Ajouter ${l.noun.a}`}
          deleteTitle={`Supprimer ${l.noun.the}`}
          several={(n) => pluralize(n, l.noun.word)}
        />
      ))}
      <ListRows
        title={product.titles}
        description={`${listDescription(product, look.scope)} ${capitalized(
          `chacun${agreement(product)}`,
        )} a ${category.a} et appartient à ${maker.a}.`}
        columns={productColumns}
        rows={settings.products.map((p) => [p.category, p.maker, p.name])}
        save={async (list) => {
          setSettings((s) => ({
            ...s,
            products: list.map(([category = "", maker = "", name = ""]) => ({
              category,
              maker,
              name,
            })),
          }));
          return true;
        }}
        emptyIcon={look.productIcon}
        emptyText={product.none}
        addLabel={`Ajouter ${product.a}`}
        deleteTitle={`Supprimer ${product.the}`}
        several={(n) => pluralize(n, product.word)}
        nameOf={([, maker = "", name = ""]) => `${maker} ${name}`}
      />
      {/* The kind's own lists, after the others: a device's identification
          types and locations tree, an application's license information
          types. */}
      {DECLARED_ASSET_EXTRA_LISTS[kind].map((list) =>
        list === "locations" ? (
          <EditableTree
            key={list}
            title={LOCATIONS_LOOK.title}
            description={LOCATIONS_LOOK.description}
            nodes={settings.locations ?? []}
            onChange={(locations) => setSettings((s) => ({ ...s, locations }))}
          />
        ) : (
          <ListRows
            key={list}
            title={EXTRA_ENTRY_LISTS[list].title}
            description={EXTRA_ENTRY_LISTS[list].description}
            columns={NAME_COLUMNS}
            rows={(settings[list] ?? []).map((e) => [e.name])}
            save={async (rows) => {
              setSettings((s) => ({ ...s, [list]: entries(rows) }));
              return true;
            }}
            emptyIcon={EXTRA_ENTRY_LISTS[list].icon}
            emptyText={EXTRA_ENTRY_LISTS[list].none}
            addLabel={EXTRA_ENTRY_LISTS[list].add}
            deleteTitle={EXTRA_ENTRY_LISTS[list].remove}
            several={(n) => pluralize(n, EXTRA_ENTRY_LISTS[list].word)}
          />
        ),
      )}
    </>
  );
}
