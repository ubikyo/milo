// What a widget that counts — an indicator, a chart — reads (shared,
// SOURCES): the widgets it names by their keys, a list's, a Mail or Calendar
// widget's, on any board one sees, of any view. Their items are the open
// board's when they are its own — already read, in its context —; another
// board's are read here, and re-read when the server says they changed.

import { Badge, Group, Text, TreeSelect } from "@mantine/core";
import type { TreeNodeData } from "@mantine/core";
import { useContext, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { DECLARED_ASSET_RESOURCES, DECLARED_ASSET_WORDS, SOURCES, sourcesOf } from "@milo/shared";
import type {
  Contact,
  DeclaredAsset,
  Id,
  LabelGroup,
  LabelsBase,
  ManagedDeviceAsset,
  Order,
  Product,
  Project,
  Resource,
  SourceWidget,
  SupportRequest,
  TaskList,
  Warehouse,
} from "@milo/shared";
import { api } from "../api";
import sourcesClasses from "../assets/styles/SourcesField.module.css";
import { GREEN } from "../themes/colors";
import { CopyPasteContext } from "../components/ui/CopyPasteActions";
import { errorMessage, notifyError } from "./errors";

/** Fired with each resource the server says changed (App.tsx). */
const RESOURCE_EVENT = "milo:resource";

export const announceResource = (resource: Resource): void => {
  window.dispatchEvent(new CustomEvent<Resource>(RESOURCE_EVENT, { detail: resource }));
};

/** Calls "listener" whenever one of these resources changes. */
export const onResources = (resources: Resource[], listener: () => void): (() => void) => {
  const handle = (e: Event) => {
    if (resources.includes((e as CustomEvent<Resource>).detail)) listener();
  };
  window.addEventListener(RESOURCE_EVENT, handle);
  return () => window.removeEventListener(RESOURCE_EVENT, handle);
};

// --- The widgets one can read ------------------------------------------------

/** What changes the widgets one sees: a widget, a board, a view. */
const STRUCTURE: Resource[] = ["board-widgets", "boards", "views"];

/** The widgets of a type one sees, read once for the page, re-read on a change. */
const catalog = new Map<string, Promise<SourceWidget[]>>();

const readCatalog = (type: string, fresh = false): Promise<SourceWidget[]> => {
  if (fresh || !catalog.has(type)) catalog.set(type, api.getSourceWidgets(type));
  return catalog.get(type)!;
};

/** The widgets of a type one can read; null while they are read. */
export function useSourceWidgets(type: string | null): SourceWidget[] | null {
  const [widgets, setWidgets] = useState<SourceWidget[] | null>(null);
  useEffect(() => {
    if (!type) return setWidgets([]);
    let current = true;
    const read = (fresh: boolean) =>
      readCatalog(type, fresh)
        .then((read) => current && setWidgets(read))
        .catch((e) => {
          catalog.delete(type);
          notifyError(errorMessage(e));
        });
    void read(false);
    const stop = onResources(STRUCTURE, () => void read(true));
    return () => {
      current = false;
      stop();
    };
  }, [type]);
  return widgets;
}

/**
 * The widgets of several types one can read — an indicator's, which reads any
 * kind its type can show —, in the order of the types; null while they are read.
 */
export function useSourceWidgetsOf(types: string[]): SourceWidget[] | null {
  const [widgets, setWidgets] = useState<SourceWidget[] | null>(null);
  const key = types.join("|");
  useEffect(() => {
    let current = true;
    const read = (fresh: boolean) =>
      Promise.all(types.map((t) => readCatalog(t, fresh)))
        .then((all) => current && setWidgets(all.flat()))
        .catch((e) => {
          for (const t of types) catalog.delete(t);
          notifyError(errorMessage(e));
        });
    void read(false);
    const stop = onResources(STRUCTURE, () => void read(true));
    return () => {
      current = false;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return widgets;
}

/**
 * The widgets a configuration reads, in its order: those of its keys one
 * sees — a widget since removed reads nothing. "field" is where it names
 * them: SOURCES, unless it reads several kinds apart (a Commandes widget).
 */
export function useSources(type: string | null, config: unknown, field: string = SOURCES): SourceWidget[] {
  const widgets = useSourceWidgets(type);
  const keys = sourcesOf(config, field);
  const joined = keys.join("\n");
  return useMemo(
    () => keys.flatMap((k) => widgets?.filter((w) => w.key === k) ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [widgets, joined],
  );
}

/** The type of the widgets read, as the field names it at the right of each. */
const TYPE_LABELS: Record<string, string> = {
  "project.list": "Projets",
  "task.list": "Tâches",
  "support.list": "Tickets",
  "managed_device_asset.list": "Équipements supervisés",
  "unmanaged_device_asset.list": DECLARED_ASSET_WORDS.unmanaged_device_asset.label,
  "application_asset.list": DECLARED_ASSET_WORDS.application_asset.label,
  "contact.list": "Contact",
  "product.list": "Produits",
  "order.list": "Commandes",
  "warehouse.list": "Entrepôts",
  "location.list": "Emplacements",
  mail: "Messages",
  calendar: "Calendrier",
};

/** The root of the tree: every view. */
export const ALL_VIEWS = "all";

// The selected values, as in a workspace's access (SectionRights): pills of
// 22 px, barely rounded.
const PILL_HEIGHT = 22;
const PILL_RADIUS = 4;

/** The look of a "Widgets associés" field, which an indicator's shares. */
export const SOURCES_FIELD_LOOK = {
  checkedStrategy: "child",
  defaultExpandedValues: [ALL_VIEWS] as string[],
  maxDisplayedValues: 0,
  maxDisplayedValuesContent: (count: number) =>
    `${count} widget${count > 1 ? "s" : ""} sélectionné${count > 1 ? "s" : ""}`,
  nothingFoundMessage: "Aucun widget",
  maxDropdownHeight: 320,
  comboboxProps: { shadow: "md", withinPortal: true },
  classNames: { dropdown: sourcesClasses.dropdown },
  styles: {
    dropdown: { "--milo-sources-check": GREEN } as CSSProperties,
    pill: {
      "--pill-height": `${PILL_HEIGHT}px`,
      height: PILL_HEIGHT,
      borderRadius: PILL_RADIUS,
    } as CSSProperties,
  },
} as const;

/**
 * A widget, as the tree shows it: its reference as a green tag, its type right
 * after; faded when it cannot go with those chosen.
 */
function WidgetLeaf({ widget, faded = false }: { widget: SourceWidget; faded?: boolean }) {
  return (
    <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0, opacity: faded ? 0.45 : 1 }}>
      <Badge variant="filled" color={GREEN} radius={PILL_RADIUS} tt="none">
        {widget.reference}
      </Badge>
      <Text size="xs" c="dimmed" truncate>
        {TYPE_LABELS[widget.type] ?? widget.type}
      </Text>
    </Group>
  );
}

/**
 * The tree of the widgets one sees: every view, then each view, its boards,
 * and their widgets. A view or a board is checked whole: all its widgets.
 */
export const sourcesTreeOf = (
  widgets: SourceWidget[],
  faded: (widget: SourceWidget) => boolean = () => false,
): TreeNodeData[] => {
  const views = new Map<Id, { label: string; boards: Map<Id, { label: string; widgets: SourceWidget[] }> }>();
  for (const w of widgets) {
    const view = views.get(w.view_id) ?? { label: w.view, boards: new Map() };
    views.set(w.view_id, view);
    const board = view.boards.get(w.board_id) ?? { label: w.board, widgets: [] };
    view.boards.set(w.board_id, board);
    board.widgets.push(w);
  }
  return [
    {
      value: ALL_VIEWS,
      label: "Toutes les vues",
      children: [...views].map(([viewId, view]) => ({
        value: `view:${viewId}`,
        label: view.label,
        children: [...view.boards].map(([boardId, board]) => ({
          value: `board:${boardId}`,
          label: board.label,
          children: board.widgets.map((w) => ({ value: w.key, label: <WidgetLeaf widget={w} faded={faded(w)} /> })),
        })),
      })),
    },
  ];
};

/**
 * The drawer's "Widgets associés" field: the widgets of its type, on every
 * board one sees — all of them, a view's, a board's, or one by one. Once
 * chosen, the field says how many. At least one: the last cannot be removed.
 * A widget that reads several kinds names each under its own "field", with
 * its own "label" — a Commandes widget's suppliers and products.
 */
export function SourcesField({
  type,
  config,
  onChange,
  field = SOURCES,
  label = "Widgets associés",
}: {
  type: string;
  config: unknown;
  onChange: (config: Record<string, unknown>) => void;
  field?: string;
  label?: string;
}) {
  const widgets = useSourceWidgets(type);
  const data = useMemo(() => sourcesTreeOf(widgets ?? []), [widgets]);
  // Only the widgets one sees: a key held by none of them reads nothing.
  const known = new Set((widgets ?? []).map((w) => w.key));
  const keys = sourcesOf(config, field).filter((k) => known.has(k));
  return (
    <TreeSelect
      mode="checkbox"
      label={label}
      data={data}
      value={keys}
      onChange={(next) => {
        if (next.length === 0) return;
        onChange({ ...((config ?? {}) as Record<string, unknown>), [field]: next });
      }}
      checkedStrategy="child"
      defaultExpandedValues={[ALL_VIEWS]}
      maxDisplayedValues={0}
      maxDisplayedValuesContent={(count) =>
        `${count} widget${count > 1 ? "s" : ""} sélectionné${count > 1 ? "s" : ""}`
      }
      placeholder={widgets === null ? "Lecture…" : keys.length ? undefined : "Choisir des widgets"}
      error={widgets && keys.length === 0 ? "Choisissez au moins un widget" : undefined}
      nothingFoundMessage="Aucun widget"
      maxDropdownHeight={320}
      comboboxProps={{ shadow: "md", withinPortal: true }}
      classNames={{ dropdown: sourcesClasses.dropdown }}
      styles={{
        dropdown: { "--milo-sources-check": GREEN } as CSSProperties,
        pill: {
          "--pill-height": `${PILL_HEIGHT}px`,
          height: PILL_HEIGHT,
          borderRadius: PILL_RADIUS,
        } as CSSProperties,
      }}
    />
  );
}

// --- Their items -------------------------------------------------------------

/** The items of each data type, as a board gives them, and what announces their change. */
const READERS: Record<string, { read: (boardId: Id) => Promise<unknown[]>; resource: Resource }> = {
  project: { read: (board) => api.getProjects({ board: String(board) }), resource: "projects" },
  task: { read: (board) => api.getTaskLists(board), resource: "task-lists" },
  support: { read: (board) => api.getSupportRequests(board), resource: "support-requests" },
  managed_device_asset: { read: (board) => api.getManagedDeviceAssets(board), resource: "managed-device-assets" },
  contact: { read: (board) => api.getContacts(board), resource: "contacts" },
  product: { read: (board) => api.getProducts(board), resource: "products" },
  order: { read: (board) => api.getOrders(board), resource: "orders" },
  warehouse: { read: (board) => api.getWarehouses(board), resource: "warehouses" },
  unmanaged_device_asset: {
    read: (board) => api.getDeclaredAssets("unmanaged_device_asset", board),
    resource: DECLARED_ASSET_RESOURCES.unmanaged_device_asset,
  },
  application_asset: {
    read: (board) => api.getDeclaredAssets("application_asset", board),
    resource: DECLARED_ASSET_RESOURCES.application_asset,
  },
};

/** What each data type gives. */
export interface SourceItems {
  project: Project;
  task: TaskList;
  support: SupportRequest;
  managed_device_asset: ManagedDeviceAsset;
  contact: Contact;
  product: Product;
  order: Order;
  warehouse: Warehouse;
  unmanaged_device_asset: DeclaredAsset;
  application_asset: DeclaredAsset;
}

/**
 * The items of the list widgets a counting one reads, of a data type: those
 * of the open board from "current" — already read, in its context — when it
 * gives them, the others read here. Null while some are read.
 */
export function useSourceItems<P extends keyof SourceItems>(
  prefix: P,
  sources: SourceWidget[],
  current?: SourceItems[P][],
): SourceItems[P][] | null {
  const openBoard = useContext(CopyPasteContext)?.board?.id;
  const reader = READERS[prefix]!;
  // The boards to read: those of the sources, the open one aside when it is given.
  const boards = [
    ...new Set(
      sources.map((s) => s.board_id).filter((b) => !(current && b === openBoard)),
    ),
  ].sort((a, b) => a - b);
  const boardsKey = boards.join(",");
  const [read, setRead] = useState<Map<Id, unknown[]>>(new Map());

  useEffect(() => {
    let alive = true;
    const load = () =>
      Promise.all(boards.map(async (b) => [b, await reader.read(b)] as const))
        .then((entries) => alive && setRead(new Map(entries)))
        .catch((e) => notifyError(errorMessage(e)));
    setRead(new Map());
    void load();
    const stop = onResources([reader.resource], () => void load());
    return () => {
      alive = false;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefix, boardsKey]);

  return useMemo(() => {
    if (boards.some((b) => !read.has(b))) return null;
    const keys = new Set(sources.map((s) => `${s.board_id}\n${s.key}`));
    const held = (item: { board_id?: Id | null; list_key: string }, board: Id) =>
      keys.has(`${item.board_id ?? board}\n${item.list_key}`);
    const own = current && openBoard !== undefined
      ? current.filter((i) => held(i as { list_key: string }, openBoard))
      : [];
    const others = boards.flatMap((b) =>
      (read.get(b) as SourceItems[P][]).filter((i) => held(i as { list_key: string }, b)),
    );
    return [...own, ...others];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [read, sources, current, openBoard, boardsKey]);
}

/**
 * The label groups of the widgets a counting one reads: by id, their name —
 * a group is chosen by its name, which each widget finds among its own.
 */
export function useSourceLabelGroups(base: LabelsBase, sources: SourceWidget[]): LabelGroup[] {
  const [groups, setGroups] = useState<LabelGroup[]>([]);
  const key = sources.map((s) => `${s.board_id}\n${s.key}`).join("|");
  useEffect(() => {
    let alive = true;
    const load = () =>
      Promise.all(sources.map((s) => api.getLabelGroups(base, { board: s.board_id, list: s.key })))
        .then((read) => alive && setGroups(read.flat()))
        .catch((e) => notifyError(errorMessage(e)));
    void load();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, key]);
  return groups;
}
