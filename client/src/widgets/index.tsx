// The registry of all the widgets a board can carry. Only one place
// knows them: the widgets drawer takes its list from it, the board panel
// the display of each, the settings drawer their fields.
//
// It merges the original registries: those of the Access mode (widgets/common, widgets/m365), shared
// by all views, and those of Support, Assets, projects and
// tasks. The latter are stored in the database under a prefix — "support.list",
// "project.labels" —: two of them had the same name, each in
// its own panel.

import { Stack } from "@mantine/core";
import type { ComponentType, ReactNode } from "react";
import { COMMON_WIDGET_TYPES, DECLARED_ASSET_KINDS, SOURCES } from "@milo/shared";
import type {
  AccessBlockType,
  ManagedDeviceAsset,
  Id,
  Project,
  SupportRequest,
  TaskList,
} from "@milo/shared";
import { MANAGED_DEVICE_ASSET_INDICATORS } from "./managed-device-asset";
import { contactListWidget } from "./contact";
import { productListWidget } from "./product";
import { orderListWidget } from "./order";
import { warehouseListWidget } from "./warehouse";
import { locationListWidget } from "./location";
import { declaredAssetWidgets } from "./declared-asset";
import { INDICATOR_WIDGETS } from "./indicators";
import { INDICATORS } from "./support";
import type { IndicatorConfigProps } from "./support/types";
import { PROJECT_INDICATORS } from "./project";
import { TASK_INDICATORS } from "./task";
import { WIDGETS } from "./common";
import { APPOINTMENT_WIDGETS } from "./m365/appointments";
import type { AppointmentWidget } from "./m365/appointments";
import {
  Frame,
  FRAME_PADDING,
  marginRows,
  marginsOf,
  configuredMargins,
  spacingRows,
} from "./margins";
import { appearanceRows } from "../components/ui/AppearanceFields";
import { alignmentRows } from "./alignment";
import { TYPE_LABELS, useSourceItems, useSources } from "../lib/sources";
import { WidgetLinksField } from "../components/ui/WidgetLinks";
import type { SourceItems } from "../lib/sources";
import { heightRow } from "./height";
import SettingRows, { frameRow } from "../components/ui/SettingRows";
import { TitleStyleField } from "../components/ui/TitleStyles";
import { FRAMED, isFramed, type AccessWidget } from "./types";
import { WidgetConfigContext } from "../lib/editing";
import { ProvideListRef } from "../lib/list-ref";
import { CARD_PADDING, GAP } from "../components/ui/IndicatorsPanel";
import type { IndicatorWidgetBase, WidgetRender } from "../components/ui/IndicatorsPanel";

/** What a board makes available to its widgets: its data, filtered by it. */
export interface BoardData {
  requests: SupportRequest[];
  projects: Project[];
  lists: TaskList[];
  managedDeviceAssets: ManagedDeviceAsset[];
  /** The signed-in account: what belongs to "me" is counted through it. */
  userId: Id;
}

/** A board widget: what every widget carries, and what to display it with. */
export interface BoardWidgetDefinition extends IndicatorWidgetBase<string> {
  /** The width of its drawer, when its fields don't fit in the common one. */
  drawerSize?: number;
  /** What the section shows of it. */
  show: (data: BoardData, config: unknown, render: WidgetRender) => ReactNode;
}

const COMMON = new Set<string>(COMMON_WIDGET_TYPES);

/**
 * The fields of an Access mode widget: its own, then the
 * "Apparence" block — its own rows, its frame and its margins, common to
 * all — and its alignment, then those it places at the very bottom — a link's switch.
 * The default proposed margins are those it has between its neighbors; when
 * the drawer doesn't know them, those of a widget alone in its column.
 */
const fieldsOf = (widget: AccessWidget): ComponentType<IndicatorConfigProps> =>
  function Fields({ config, onChange, neighbors }: IndicatorConfigProps) {
    // Its appearance rows, then the frame and the margins: on its own
    // configuration, or on its style's (TitleStyleField).
    const rows = (c: unknown, change: (config: Record<string, unknown>) => void) => [
      ...(widget.appearance?.(c, change) ?? []),
      frameRow(c, change, FRAMED, isFramed(c, widget.defaultFrame), widget.defaultFrame ?? false),
      // The space it really leaves between its neighbors. Without them, a
      // title shows the space it leaves after an element — the one it
      // usually has; at the head of a column, it leaves none above.
      ...marginRows(
        widget,
        (c ?? {}) as Record<string, unknown>,
        change,
        neighbors
          ? {
              previousType: neighbors.previousType as AccessBlockType | null,
              nextType: neighbors.nextType as AccessBlockType | null,
            }
          : { previousType: widget.styled ? "link" : null, nextType: null },
      ),
    ];
    // Its height, then its alignment in it: its own configuration's, never
    // its style's.
    const placement = [heightRow(config, onChange, undefined, widget.defaultConfig), ...alignmentRows(config, onChange)];
    return (
      <Stack gap="xl">
        <widget.Config config={config} onChange={onChange} />
        {/* In a single block, then its alignment, which stays its own. */}
        {widget.styled ? (
          <TitleStyleField
            config={config}
            onChange={onChange}
            rows={rows}
            after={placement}
            defaultStyle={widget.defaultStyle}
            type={widget.type}
          />
        ) : (
          <SettingRows
            label="Apparence"
            rows={[...rows(config, onChange), ...placement]}
          />
        )}
        {widget.ConfigEnd && <widget.ConfigEnd config={config} onChange={onChange} />}
      </Stack>
    );
  };

/** An Access mode widget, as a board widget. */
const fromAccess = (widget: AccessWidget): BoardWidgetDefinition => ({
  type: widget.type,
  kind: widget.kind,
  label: widget.label,
  icon: widget.icon,
  defaultConfig: widget.defaultConfig,
  Config: fieldsOf(widget),
  // Titles keep their double-click, the link its click, and the others
  // already have their inset: none is placed in the indicators card.
  ownClicks: true,
  ...(widget.inlineEdit ? { inlineEdit: true } : {}),
  ...(widget.liveContent ? { liveContent: true } : {}),
  ...(widget.drawerSize ? { drawerSize: widget.drawerSize } : {}),
  ...(widget.hidden ? { hidden: widget.hidden } : {}),
  ...(widget.styled ? { styled: widget.styled } : {}),
  ...(widget.defaultStyle ? { defaultStyle: widget.defaultStyle } : {}),
  margins: (config, previousType, nextType) =>
    marginsOf(widget, config, {
      previousType: previousType as AccessBlockType | null,
      nextType: nextType as AccessBlockType | null,
    }),
  show: (_data, config, { id, onChange, onEdit, locked }) => {
    const content = (
      <widget.Display
        blockId={id}
        config={config}
        onChange={onChange}
        onEdit={onEdit}
        locked={locked}
      />
    );
    // A widget that draws its own frame doesn't get a second one: its
    // padding is its own too.
    if (widget.ownFrame) return content;
    // A title's frame and padding are its style's, when it has one.
    const shown = widget.styled?.(config) ?? config;
    return (
      <Frame
        config={shown}
        framed={isFramed(shown, widget.defaultFrame)}
        padding={widget.padding?.(shown)}
      >
        {content}
      </Frame>
    );
  },
});

/** An indicator's spacing while nothing is set: half their gap, on each side. */
const MARGINS_INDICATOR = { top: GAP / 2, bottom: GAP / 2 };

/**
 * A card's — a chart, an indicator —: tight against what precedes it, apart
 * from what follows.
 */
const MARGINS_CARD = { top: 0, bottom: 15 };

/** The spacing of a widget while nothing is set: a card's, or a list's. */
const regularMargins = (w: IndicatorWidgetBase<string>) =>
  w.ownClicks ? MARGINS_INDICATOR : MARGINS_CARD;

/**
 * The "Apparence" block of an indicator: its card — title, value, background —
 * if it has one, its frame, its margins, its height, its alignment. A card is framed as long as nothing
 * is set; a list, which keeps its clicks, is not. A chart's colors follow, in
 * their own block.
 */
const appearanceOf = (w: IndicatorWidgetBase<string>): ComponentType<IndicatorConfigProps> =>
  function Appearance({ config, onChange }: IndicatorConfigProps) {
    const card = !w.ownClicks;
    const chart = w.chartAppearance?.(config, onChange);
    return (
      <Stack gap="xl">
        <SettingRows
          label="Apparence"
          rows={[
            ...(card ? appearanceRows(config, onChange, w.withValue, !w.ownAlignment) : []),
            ...(w.frameless ? [] : [frameRow(config, onChange, FRAMED, isFramed(config, card), card)]),
            ...spacingRows(
              regularMargins(w),
              isFramed(config, card) && !w.frameless ? (card ? CARD_PADDING : FRAME_PADDING) : 0,
              config,
              onChange,
            ),
            heightRow(config, onChange, w.defaultHeight?.(config), w.defaultConfig),
            ...(w.ownAlignment ? [] : alignmentRows(config, onChange)),
          ]}
        />
        {w.ownAlignment?.(config, onChange).map((group) => (
          <SettingRows key={group.label} label={group.label} rows={group.rows} />
        ))}
        {chart && <SettingRows label="Apparence du graphique" rows={chart} />}
      </Stack>
    );
  };

/** Where each data type's items are in a board's data. */
const FIELDS = {
  project: "projects",
  task: "lists",
  support: "requests",
  managed_device_asset: "managedDeviceAssets",
} as const satisfies Partial<Record<keyof SourceItems, keyof BoardData>>;

type CountedPrefix = keyof typeof FIELDS;

const isCounted = (prefix: string): prefix is CountedPrefix => prefix in FIELDS;

/**
 * The board's data, its items of the prefix replaced by those of the list
 * widgets the configuration reads (lib/sources.tsx) — of this board or
 * another.
 */
function FromSources({
  prefix,
  data,
  config,
  children,
}: {
  prefix: CountedPrefix;
  data: BoardData;
  config: unknown;
  children: (data: BoardData) => ReactNode;
}) {
  const field = FIELDS[prefix];
  const sources = useSources(`${prefix}.list`, config);
  const items = useSourceItems(prefix, sources, data[field] as SourceItems[typeof prefix][]);
  return <>{children({ ...data, [field]: items ?? [] })}</>;
}

/**
 * The widgets specific to a data type, under their prefix. The common widgets
 * that their registry took over from the Access mode aren't there: they
 * come once, from the Access mode itself. All but the list read the list
 * widgets their drawer names (SOURCES), on any board.
 */
const prefixed = <W extends IndicatorWidgetBase<string>>(
  prefix: string,
  widgets: W[],
  show: (widget: W, data: BoardData, config: unknown, render: WidgetRender) => ReactNode,
): BoardWidgetDefinition[] =>
  widgets
    .filter((w) => !COMMON.has(w.type))
    .map((w) => {
      const follows = w.type !== "list";
      // A widget that places its own sources field reads its lists itself.
      const wrapsSource = follows && !w.ownSource && isCounted(prefix);
      const content = (data: BoardData, config: unknown, render: WidgetRender) =>
        wrapsSource ? (
          <FromSources prefix={prefix} data={data} config={config}>
            {(read) => show(w, read, config, render)}
          </FromSources>
        ) : (
          show(w, data, config, render)
        );
      const Own = w.Config;
      // A list owns its labels, categories and tables: its display and its
      // drawer know which list it is (lib/list-ref.tsx).
      const isList = w.type === "list";
      return {
        ...w,
        type: `${prefix}.${w.type}`,
        ...(isList &&
          Own && {
            Config: (props: IndicatorConfigProps) => (
              <ProvideListRef config={props.config}>
                <Own {...props} />
              </ProvideListRef>
            ),
          }),
        ...(wrapsSource && {
          Config: ({ config, onChange }: IndicatorConfigProps) => (
            <Stack gap="xl">
              <WidgetLinksField
                inputs={[
                  { field: SOURCES, label: TYPE_LABELS[`${prefix}.list`] ?? "Widget", types: [`${prefix}.list`] },
                ]}
                config={config}
                onChange={onChange}
              />
              {Own && <Own config={config} onChange={onChange} />}
            </Stack>
          ),
        }),
        // The frame and margins, as for all widgets: a card
        // is already framed by the panel (IndicatorsPanel); a list is
        // here, on request.
        Appearance: appearanceOf(w),
        margins: (config: unknown) => configuredMargins(config, regularMargins(w)),
        // A card has its padding from the panel (IndicatorsPanel). A list
        // may save its configuration in place: its columns' widths, set above
        // them in edit mode (useColumnWidthEditing).
        show: (data: BoardData, config: unknown, render: WidgetRender) => {
          const shown = w.ownClicks ? (
            <WidgetConfigContext.Provider value={{ onChange: render.onChange, locked: render.locked }}>
              <Frame config={config} framed={!w.frameless && isFramed(config)}>
                {content(data, config, render)}
              </Frame>
            </WidgetConfigContext.Provider>
          ) : (
            content(data, config, render)
          );
          return isList ? <ProvideListRef config={config}>{shown}</ProvideListRef> : shown;
        },
      };
    });

/**
 * The Microsoft 365 widgets that follow another of their board — the mail
 * counts (m365/mail-counts.tsx), the appointments (m365/appointments.tsx):
 * cards like the indicators of a data type, or a list, but without a prefix —
 * they read no board data.
 */
const followers = (widgets: AppointmentWidget[]): BoardWidgetDefinition[] =>
  widgets.map((w) => ({
    ...w,
    Appearance: appearanceOf(w),
    margins: (config) => configuredMargins(config, regularMargins(w)),
    // A list has its frame here, on request; a card, from the panel.
    show: (_data, config, render) =>
      w.ownClicks ? (
        <Frame config={config} framed={!w.frameless && isFramed(config)}>
          <w.Display config={config} {...render} />
        </Frame>
      ) : (
        <w.Display config={config} {...render} />
      ),
  }));

/** The managed device assets widgets: their list, then their indicators. */
const MANAGED_DEVICE_ASSETS = prefixed(
  "managed_device_asset",
  MANAGED_DEVICE_ASSET_INDICATORS,
  (w, d, config, render) => (
    <w.Display config={config} assets={d.managedDeviceAssets} {...render} />
  ),
);
const MANAGED_DEVICE_ASSET_LIST = "managed_device_asset.list";
const MANAGED_DEVICE_ASSET_LIST_WIDGET = MANAGED_DEVICE_ASSETS.filter(
  (w) => w.type === MANAGED_DEVICE_ASSET_LIST,
);
const MANAGED_DEVICE_ASSET_INDICATOR_WIDGETS = MANAGED_DEVICE_ASSETS.filter(
  (w) => w.type !== MANAGED_DEVICE_ASSET_LIST,
);

/** In the order the widgets drawer presents them, grouped by type. */
export const BOARD_WIDGETS: BoardWidgetDefinition[] = [
  ...WIDGETS.map(fromAccess),
  ...followers(APPOINTMENT_WIDGETS),
  ...prefixed("project", PROJECT_INDICATORS, (w, d, config, render) => (
    <w.Display config={config} projects={d.projects} userId={d.userId} {...render} />
  )),
  ...prefixed("task", TASK_INDICATORS, (w, d, config, render) => (
    <w.Display config={config} lists={d.lists} userId={d.userId} {...render} />
  )),
  ...prefixed("support", INDICATORS, (w, d, config, render) => (
    <w.Display config={config} requests={d.requests} userId={d.userId} {...render} />
  )),
  // The asset lists side by side — the drawer files them under the same
  // title: the managed device assets', the declared ones' —, then the managed
  // device asset indicators.
  ...MANAGED_DEVICE_ASSET_LIST_WIDGET,
  ...DECLARED_ASSET_KINDS.flatMap((kind) =>
    prefixed(kind, declaredAssetWidgets(kind), (w, _d, config, render) => (
      <w.Display config={config} {...render} />
    )),
  ),
  ...MANAGED_DEVICE_ASSET_INDICATOR_WIDGETS,
  // The logistics: the contacts, the products, the orders, the warehouses,
  // the locations, then their indicator.
  ...prefixed("contact", [contactListWidget], (w, _d, config, render) => (
    <w.Display config={config} {...render} />
  )),
  ...prefixed("product", [productListWidget], (w, _d, config, render) => (
    <w.Display config={config} {...render} />
  )),
  ...prefixed("order", [orderListWidget], (w, d, config, render) => (
    <w.Display config={config} userId={d.userId} {...render} />
  )),
  ...prefixed("warehouse", [warehouseListWidget], (w, _d, config, render) => (
    <w.Display config={config} {...render} />
  )),
  ...prefixed("location", [locationListWidget], (w, _d, config, render) => (
    <w.Display config={config} {...render} />
  )),
  // The "Indicateurs": a number, bars, a ring… of the data chosen in their
  // drawer — any list widget kind that gives one (widgets/indicators).
  ...prefixed("indicator", INDICATOR_WIDGETS, (w, d, config, render) => (
    <w.Display config={config} board={d} {...render} />
  )),
];

const BY_TYPE = new Map(BOARD_WIDGETS.map((w) => [w.type, w]));

/**
 * The widget that can read this type, or "undefined": a type stored by a
 * version that knew one more must not crash the page.
 */
export const boardWidget = (type: string): BoardWidgetDefinition | undefined => BY_TYPE.get(type);
