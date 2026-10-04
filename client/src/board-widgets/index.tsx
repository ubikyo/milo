// The registry of all the widgets a board can carry. Only one place
// knows them: the widgets drawer takes its list from it, the board panel
// the display of each, the settings drawer their fields.
//
// It merges the original registries: those of the Access mode (widgets/), shared
// by all views, and those of Support, Assets, projects and
// tasks. The latter are stored in the database under a prefix — "support.list",
// "project.labels" —: two of them had the same name, each in
// its own panel.

import { Box, Stack } from "@mantine/core";
import type { ComponentType, ReactNode } from "react";
import { COMMON_WIDGET_TYPES } from "@milo/shared";
import type { AccessBlockType, Asset, Id, Project, SupportRequest, TaskList } from "@milo/shared";
import { ASSET_INDICATORS } from "../asset-indicators";
import { INDICATORS } from "../indicators";
import type { IndicatorConfigProps } from "../indicators/types";
import { PROJECT_INDICATORS } from "../project-indicators";
import { TASK_INDICATORS } from "../task-indicators";
import { WIDGETS } from "../widgets";
import { marginRows, marginRowsFor, marginsOf, configuredMargins } from "../widgets/margins";
import inset from "../assets/styles/AccessNumber.module.css";
import { appearanceRows } from "../components/ui/AppearanceFields";
import SettingRows, { frameRow } from "../components/ui/SettingRows";
import { FRAMED, isFramed, type AccessWidget } from "../widgets/types";
import { GAP } from "../components/ui/IndicatorsPanel";
import type { IndicatorWidgetBase, WidgetRender } from "../components/ui/IndicatorsPanel";

/** What a board makes available to its widgets: its data, filtered by it. */
export interface BoardData {
  requests: SupportRequest[];
  projects: Project[];
  lists: TaskList[];
  assets: Asset[];
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
 * all —, then those it places at the very bottom — a link's switch.
 * The drawer doesn't know its neighbors: the default proposed margins are
 * those of a widget alone in its column.
 */
const fieldsOf = (widget: AccessWidget): ComponentType<IndicatorConfigProps> =>
  function Fields({ config, onChange }: IndicatorConfigProps) {
    const subject = (config ?? {}) as Record<string, unknown>;
    return (
      <Stack gap="xl">
        <widget.Config config={config} onChange={onChange} />
        {/* Its appearance rows, then the margins, in a single block. */}
        <SettingRows
          label="Apparence"
          rows={[
            ...(widget.appearance?.(config, onChange) ?? []),
            frameRow(
              config,
              onChange,
              FRAMED,
              isFramed(config, widget.defaultFrame),
              widget.defaultFrame ?? false,
            ),
            ...marginRows(widget, subject, onChange, { previousType: null, nextType: null }),
          ]}
        />
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
  ...(widget.drawerSize ? { drawerSize: widget.drawerSize } : {}),
  ...(widget.hidden ? { hidden: widget.hidden } : {}),
  margins: (config, previousType, nextType) =>
    marginsOf(widget, config, {
      previousType: previousType as AccessBlockType | null,
      nextType: nextType as AccessBlockType | null,
    }),
  show: (_data, config, { id, onChange, locked }) =>
    frame(
      <widget.Display
        blockId={id}
        config={config}
        onChange={onChange}
        onEdit={() => {}}
        locked={locked}
      />,
      // A widget that draws its own frame doesn't get a second one.
      !widget.ownFrame && isFramed(config, widget.defaultFrame),
    ),
});

/**
 * The frame the registry puts around a widget that doesn't draw it
 * itself: the attributes inset, without a border — that of clocks and
 * framed feeds.
 */
const frame = (content: ReactNode, framed: boolean): ReactNode =>
  framed ? (
    <Box className={inset.inset} style={{ border: "none" }}>
      {content}
    </Box>
  ) : (
    content
  );

/** An indicator's spacing while nothing is set: half their gap, on each side. */
const MARGINS_INDICATOR = { top: GAP / 2, bottom: GAP / 2 };

/**
 * The "Apparence" block of an indicator: its card — title, value, background —
 * if it has one, its frame, its margins. A card is framed as long as nothing
 * is set; a list, which keeps its clicks, is not.
 */
const appearanceOf = (w: IndicatorWidgetBase<string>): ComponentType<IndicatorConfigProps> =>
  function Appearance({ config, onChange }: IndicatorConfigProps) {
    const card = !w.ownClicks;
    return (
      <SettingRows
        label="Apparence"
        rows={[
          ...(card ? appearanceRows(config, onChange, w.withValue) : []),
          frameRow(config, onChange, FRAMED, isFramed(config, card), card),
          ...marginRowsFor(MARGINS_INDICATOR, config, onChange),
        ]}
      />
    );
  };

/**
 * The widgets specific to a data type, under their prefix. The common widgets
 * that their registry took over from the Access mode aren't there: they
 * come once, from the Access mode itself.
 */
const prefixed = <W extends IndicatorWidgetBase<string>>(
  prefix: string,
  widgets: W[],
  show: (widget: W, data: BoardData, config: unknown, render: WidgetRender) => ReactNode,
): BoardWidgetDefinition[] =>
  widgets
    .filter((w) => !COMMON.has(w.type))
    .map((w) => ({
      ...w,
      type: `${prefix}.${w.type}`,
      // The frame and margins, as for all widgets: a card
      // is already framed by the panel (IndicatorsPanel); a list is
      // here, on request.
      Appearance: appearanceOf(w),
      margins: (config) => configuredMargins(config, MARGINS_INDICATOR),
      show: (data, config, render) =>
        frame(show(w, data, config, render), Boolean(w.ownClicks) && isFramed(config)),
    }));

/** In the order the widgets drawer presents them, grouped by type. */
export const BOARD_WIDGETS: BoardWidgetDefinition[] = [
  ...WIDGETS.map(fromAccess),
  ...prefixed("project", PROJECT_INDICATORS, (w, d, config, render) => (
    <w.Display config={config} projects={d.projects} userId={d.userId} {...render} />
  )),
  ...prefixed("task", TASK_INDICATORS, (w, d, config, render) => (
    <w.Display config={config} lists={d.lists} userId={d.userId} {...render} />
  )),
  ...prefixed("support", INDICATORS, (w, d, config, render) => (
    <w.Display config={config} requests={d.requests} userId={d.userId} {...render} />
  )),
  ...prefixed("asset", ASSET_INDICATORS, (w, d, config, render) => (
    <w.Display config={config} assets={d.assets} {...render} />
  )),
];

const BY_TYPE = new Map(BOARD_WIDGETS.map((w) => [w.type, w]));

/**
 * The widget that can read this type, or "undefined": a type stored by a
 * version that knew one more must not crash the page.
 */
export const boardWidget = (type: string): BoardWidgetDefinition | undefined => BY_TYPE.get(type);

/** The permitted conversions: the category and the sub-category share their configuration. */
export const CONVERSIONS: Record<string, string> = {
  category: "subcategory",
  subcategory: "category",
};
