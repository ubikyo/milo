import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useListRef } from "../../lib/list-ref";
import type { ComponentType } from "react";
import {
  DECLARED_ASSET_DEFAULT_CATEGORIES,
  DECLARED_ASSET_EXTRA_LISTS,
  DECLARED_ASSET_EXTRA_LIST_DEFAULTS,
  DECLARED_ASSET_LIST_SOURCES,
  DECLARED_ASSET_NAME_MAX,
  sourcesOf,
} from "@milo/shared";
import type {
  DeclaredAssetEntry,
  DeclaredAssetKind,
  DeclaredAssetLocation,
  DeclaredAssetNoun,
  DeclaredAssetSettings,
  Label,
} from "@milo/shared";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { resetRows, resetTree } from "../../lib/reset-defaults";
import { CopyPasteContext } from "../ui/CopyPasteActions";
import { DrawerRegistrationsContext } from "../ui/IndicatorDrawer";
import { pluralize } from "../ui/DrawerRows";
import { ListRows } from "../ui/EditableRows";
import EditableTree from "../ui/EditableTree";
import type { TreeWords } from "../ui/EditableTree";
import type { Column, Row } from "../ui/EditableRows";
import {
  DECLARED_ASSET_LOOKS,
  EXTRA_ENTRY_LISTS,
  LOCATIONS_LOOK,
  usedBy,
} from "./kinds";

// The open board's lists of one declared asset kind, in the drawer of its
// widget: categories — a tree (EditableTree), as a "Projets" widget's —,
// makers, and products — each of a category and a maker —, in the
// kind's words: device types, brands and models; software types, publishers
// and applications. Like the managed device asset tables
// (ManagedDeviceAssetTablesFields), they are not widget settings but board
// data, shared by all the kind's widgets: they go with "Sauvegarder".
//
// A product names its category by its id, picked in the tree level after
// level, and its maker by its name: renaming a maker renames it in its
// products. A category or a maker still named by a product cannot be
// deleted. Some kinds have more lists, after those: a device's identification
// types and its locations — a tree too —, an application's license
// information types. A list the widget takes from Liste widgets — its
// makers, its types — is edited there, and not shown here.

/** The width of the category column — a path, "Écran > Moniteur" —, in the products list. */
const CATEGORY_WIDTH = 150;

/** The width of the maker column, in the products list. */
const CHOICE_WIDTH = 140;

const NAME_COLUMNS: Column[] = [{ label: "Nom", maxLength: DECLARED_ASSET_NAME_MAX }];

/** Nothing recorded yet. */
const NOTHING: DeclaredAssetSettings = { categories: [], suppliers: [], makers: [], products: [] };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const entries = (list: Row[]): DeclaredAssetEntry[] => list.map(([name = ""]) => ({ name }));

export default function DeclaredAssetTablesFields({
  kind,
  config,
}: {
  kind: DeclaredAssetKind;
  /** The widget's configuration: the lists it takes from Liste widgets are not edited here. */
  config: unknown;
}) {
  const look = DECLARED_ASSET_LOOKS[kind];
  const { category, maker, product } = look.words;
  const board = useContext(CopyPasteContext);
  const register = useContext(DrawerRegistrationsContext);
  const list = useListRef();
  // A paste from the "Actions" menu may change the board: it is re-read.
  const pastes = board?.pastes ?? 0;

  /** What the server holds, and the draft made from it. */
  const [original, setOriginal] = useState<DeclaredAssetSettings>(NOTHING);
  const [settings, setSettings] = useState<DeclaredAssetSettings>(NOTHING);

  const reload = useCallback(async () => {
    if (list === null) return;
    try {
      const read = await api.getDeclaredAssetSettings(kind, list);
      setOriginal(read);
      setSettings(read);
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [kind, list]);

  useEffect(() => {
    void reload();
  }, [reload, pastes]);

  // The widget's labels, which a root of the locations tree may be tied to.
  // Re-read after each save: those added in this drawer then come.
  const [labels, setLabels] = useState<Label[]>([]);
  const withLocations = DECLARED_ASSET_EXTRA_LISTS[kind].includes("locations");
  const [saves, setSaves] = useState(0);
  useEffect(() => {
    if (list === null || !withLocations) return;
    api
      .getDeclaredAssetLabels(kind, list)
      .then(setLabels)
      .catch((e) => notifyError(errorMessage(e)));
  }, [kind, list, withLocations, pastes, saves]);

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
      const data: Partial<DeclaredAssetSettings> = {};
      if (!same(before.categories, after.categories)) data.categories = after.categories;
      if (!same(before.suppliers, after.suppliers)) data.suppliers = after.suppliers;
      if (!same(before.makers, after.makers)) data.makers = after.makers;
      if (!same(before.products, after.products)) data.products = after.products;
      for (const list of DECLARED_ASSET_EXTRA_LISTS[kind]) {
        if (!same(before[list], after[list])) Object.assign(data, { [list]: after[list] });
      }
      setSaves((n) => n + 1);
      if (Object.keys(data).length === 0) return;
      const saved = await api.updateDeclaredAssetSettings(kind, list, data);
      setOriginal(saved);
      setSettings(saved);
    });
  }, [register, kind, list]);

  if (list === null || !register) return null;

  /** A list taken from Liste widgets: edited there, not here (DECLARED_ASSET_LIST_SOURCES). */
  const sourced = (name: string): boolean => {
    const field = (DECLARED_ASSET_LIST_SOURCES[kind] as Record<string, string | undefined>)[name];
    return field !== undefined && sourcesOf(config, field).length > 0;
  };

  /**
   * The makers change: a renamed one — same place, another name — is renamed
   * in its products; one still named by a product stays.
   */
  const saveMakers = async (list: Row[]): Promise<boolean> => {
    const next = entries(list);
    const before = settings.makers;
    const renamed = new Map<string, string>();
    if (next.length === before.length) {
      before.forEach((e, i) => {
        const after = next[i]?.name;
        if (after && after !== e.name) renamed.set(e.name, after);
      });
    }
    const kept = new Set(next.map((e) => e.name));
    const orphan = settings.products.find((p) => !kept.has(p.maker) && !renamed.has(p.maker));
    if (orphan) {
      notifyError(`${usedBy(maker, orphan.maker)} par ${product.the} « ${orphan.name} »`);
      return false;
    }
    setSettings((s) => ({
      ...s,
      makers: next,
      products: s.products.map((p) => ({ ...p, maker: renamed.get(p.maker) ?? p.maker })),
    }));
    return true;
  };

  /**
   * The categories tree changes, unless it removes a category still named by
   * a product: the tree stays as it was, and says so.
   */
  const changeCategories = (next: DeclaredAssetLocation[]) => {
    const kept = new Set(next.map((c) => c.id));
    const orphan = settings.products.find((p) => p.category && !kept.has(p.category));
    if (orphan) {
      const name = settings.categories.find((c) => c.id === orphan.category)?.name ?? "";
      notifyError(`${usedBy(category, name)} par ${product.the} « ${orphan.name} »`);
      return;
    }
    setSettings((s) => ({ ...s, categories: next }));
  };

  const categoryWords: TreeWords = {
    icon: look.categoryIcon,
    none: category.none,
    the: category.the,
    plural: category.titles.toLowerCase(),
  };

  /**
   * The lists made of names alone, in the order the drawer shows them. The
   * suppliers are not among them: they are the companies of the Contact
   * widgets associated with the widget.
   */
  const nameLists: {
    key: "makers";
    noun: DeclaredAssetNoun;
    icon: ComponentType<{ size?: number }>;
    save: (list: Row[]) => Promise<boolean>;
  }[] = [
    {
      key: "makers",
      noun: maker,
      icon: look.makerIcon,
      save: saveMakers,
    },
  ];

  // The category, picked in the board's tree, the maker, chosen among the
  // board's, then the product's name.
  const productColumns: Column[] = [
    {
      label: category.title,
      maxLength: DECLARED_ASSET_NAME_MAX,
      width: CATEGORY_WIDTH,
      tree: settings.categories,
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
      <EditableTree
        title={category.titles}
        nodes={settings.categories}
        onChange={changeCategories}
        words={categoryWords}
        // The tree a new widget brings (shared): a category a product still
        // names cannot go, and the reset is refused, as a deletion.
        reset={{
          what: `les ${category.titles.toLowerCase()}`,
          onReset: (replace) =>
            changeCategories(resetTree(settings.categories, DECLARED_ASSET_DEFAULT_CATEGORIES[kind], replace)),
        }}
      />
      {nameLists.filter((l) => !sourced(l.key)).map((l) => (
        <ListRows
          key={l.key}
          title={l.noun.titles}
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
            nodes={settings.locations ?? []}
            onChange={(locations) => setSettings((s) => ({ ...s, locations }))}
            // A root may be tied to a label: only the assets that carry it
            // are offered what is under it (DeclaredAssetDrawer).
            rootLabels={labels}
          />
        ) : sourced(list) ? null : (
          <ListRows
            key={list}
            title={EXTRA_ENTRY_LISTS[list].title}
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
            reset={{
              what: `les ${EXTRA_ENTRY_LISTS[list].title.toLowerCase()}`,
              onReset: (replace) =>
                setSettings((s) => ({
                  ...s,
                  [list]: resetRows(
                    s[list] ?? [],
                    DECLARED_ASSET_EXTRA_LIST_DEFAULTS[list] as DeclaredAssetEntry[],
                    replace,
                  ),
                })),
            }}
          />
        ),
      )}
    </>
  );
}
