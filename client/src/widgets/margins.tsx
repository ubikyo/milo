import { Box } from "@mantine/core";
import type { CSSProperties, ReactNode } from "react";
import inset from "../assets/styles/AccessNumber.module.css";
import { insertRow, type SettingRow, type SizeSetting } from "../components/ui/SettingRows";
import alignment from "../assets/styles/Alignment.module.css";
import { alignmentProps } from "./alignment";
import { count, isFramed } from "./types";
import type { AccessWidget, Margins, Padding } from "./types";
import type { BoardWidget, AccessBlockType } from "@milo/shared";

// The space around a column element (margin) and inside it (padding), on its
// four sides.
//
// Above and below, each widget says the margin it usually leaves, depending
// on what surrounds it ("margins"); on the sides, it leaves none. The padding
// is that of its frame when it has one, none otherwise. The configuration can
// override each of them, side by side: a field is stored only when it differs
// from the usual value, so that an element left as is still follows its
// neighbors when it is moved, and its frame when it is switched on or off.

const HIGH_MARGIN = "marginTop";
const LOW_MARGIN = "marginBottom";
const LEFT_MARGIN = "marginLeft";
const RIGHT_MARGIN = "marginRight";

/** The four sides, in the CSS order, with the arrow that names them in the drawer. */
const SIDES = [
  { side: "Top", arrow: "↑", what: "haut" },
  { side: "Right", arrow: "→", what: "droit" },
  { side: "Bottom", arrow: "↓", what: "bas" },
  { side: "Left", arrow: "←", what: "gauche" },
] as const;

type Side = (typeof SIDES)[number]["side"];

/** The space on each side, in pixels. */
export type Sides = Record<Side, number>;

/** A padding, side by side. */
const sidesOf = (p: Padding): Sides =>
  typeof p === "number" ? { Top: p, Right: p, Bottom: p, Left: p } : p;

/** Beyond that, the element would get lost far from its column. */
const MARGIN_MAX = 200;

/** The padding of a frame (the attributes inset) while nothing is set. */
export const FRAME_PADDING = 10;

interface Neighbors {
  previousType: AccessBlockType | null;
  nextType: AccessBlockType | null;
}

/** A margin stored in the configuration, or "null": the widget's usual one applies. */
const configured = (config: unknown, key: string): number | null => {
  const readValue = count(config, key, Number.NaN);
  return Number.isNaN(readValue) ? null : readValue;
};

/**
 * The elements that open a group: the space above them is the larger of their
 * own and the previous element's (Margins.collapse), not their sum.
 */
const TITLES: AccessBlockType[] = ["category"];

/** The widget's usual space. */
const regularOf = (
  widget: AccessWidget,
  { previousType, nextType }: Neighbors,
  config: unknown,
): Margins => widget.margins(previousType, nextType, config);

/** The space the element really leaves: its own, or that of its configuration. */
export const marginsOf = (
  widget: AccessWidget,
  config: unknown,
  neighbors: Neighbors,
): Margins => {
  const margins = configuredMargins(
    widget.styled?.(config) ?? config,
    regularOf(widget, neighbors, config),
  );
  return TITLES.includes(widget.type) ? { ...margins, collapse: true } : margins;
};

/**
 * The types surrounding the element in its column, as the column shows them:
 * a hidden element or one of an unknown type neither precedes nor follows
 * anyone (components/ui/SectionsBoard.tsx). The elements already arrive in
 * their order.
 */
export const neighborsOf = (
  blocks: BoardWidget[],
  block: BoardWidget,
  widgetFor: (type: AccessBlockType) => AccessWidget | undefined,
  locked: boolean,
): Neighbors => {
  const visibleItems = blocks.filter((b) => {
    if (b.section_id !== block.section_id) return false;
    if (b.id === block.id) return true;
    const widget = widgetFor(b.type as AccessBlockType);
    return widget !== undefined && !widget.hidden?.(b.config, locked);
  });
  const rank = visibleItems.findIndex((b) => b.id === block.id);
  return {
    previousType: (visibleItems[rank - 1]?.type as AccessBlockType | undefined) ?? null,
    nextType: (visibleItems[rank + 1]?.type as AccessBlockType | undefined) ?? null,
  };
};

/** The space the configuration sets, the usual one applying elsewhere. */
export const configuredMargins = (config: unknown, regular: Margins): Margins => ({
  top: configured(config, HIGH_MARGIN) ?? regular.top,
  bottom: configured(config, LOW_MARGIN) ?? regular.bottom,
});

/**
 * The margins on the sides, none while nothing is set. Above and below, the
 * column sets them between its elements (configuredMargins).
 */
export const sideMargins = (config: unknown): CSSProperties => ({
  marginLeft: configured(config, LEFT_MARGIN) ?? 0,
  marginRight: configured(config, RIGHT_MARGIN) ?? 0,
});

/** The padding on each side: the configuration's, "regular" elsewhere. */
export const paddingOf = (config: unknown, regular: Padding): Sides => {
  const usual = sidesOf(regular);
  return {
    Top: configured(config, "paddingTop") ?? usual.Top,
    Right: configured(config, "paddingRight") ?? usual.Right,
    Bottom: configured(config, "paddingBottom") ?? usual.Bottom,
    Left: configured(config, "paddingLeft") ?? usual.Left,
  };
};

/** The same, as a style. */
export const paddingStyle = (config: unknown, regular: Padding): CSSProperties => {
  const p = paddingOf(config, regular);
  return { padding: `${p.Top}px ${p.Right}px ${p.Bottom}px ${p.Left}px` };
};

/**
 * A widget's frame — the attributes inset, without a border — with its
 * padding. Unframed, the element keeps only the padding it is given, and is
 * left as is when it has none.
 */
export function Frame({
  config,
  framed,
  padding,
  children,
}: {
  config: unknown;
  framed: boolean;
  /** The padding while nothing is set, when it is not the frame's or none. */
  padding?: Padding;
  children: ReactNode;
}) {
  const regular = padding ?? (framed ? FRAME_PADDING : 0);
  const sides = paddingOf(config, regular);
  if (!framed && Object.values(sides).every((v) => v === 0)) return <>{children}</>;
  // Aligned, the frame fills the widget's place, and the content moves inside
  // it (widgets/alignment.ts, Alignment.module.css).
  const aligned = alignmentProps(config);
  // What the frame holds keeps its own height: the stylesheet makes the frame
  // fill its place.
  const { flex: _flex, minHeight: _minHeight, ...alignedStyle } = aligned.style;
  return (
    <Box
      className={[framed ? inset.inset : undefined, alignment.frame, aligned.className]
        .filter(Boolean)
        .join(" ")}
      style={{ ...alignedStyle, ...paddingStyle(config, regular), border: "none" }}
    >
      {children}
    </Box>
  );
}

/**
 * The "Margin" and "Padding" rows, at the end of the drawer's "Apparence"
 * block (SettingRows), for any widget: each carries its four sides and shows
 * the space in effect. Bringing a field back to the usual value, clearing it
 * or clicking the row's button removes the setting.
 */
export const spacingRows = (
  regular: Margins,
  padding: Padding,
  config: unknown,
  onChange: (config: Record<string, unknown>) => void,
): SettingRow[] => {
  const row = (name: string, kind: string, what: string, usual: Sides): SettingRow => {
    const key = (side: Side) => `${kind}${side}`;
    const sizes = SIDES.map(({ side, arrow, what: where }): SizeSetting => {
      const value = configured(config, key(side)) ?? usual[side];
      return {
        value,
        defaultValue: usual[side],
        min: 0,
        max: MARGIN_MAX,
        onChange: (v) =>
          onChange(insertRow(config, { [key(side)]: v === usual[side] ? "" : v })),
        prefix: arrow,
        what: `${what} ${where}`,
      };
    });
    return {
      name,
      what,
      sizes,
      modified: sizes.some((size) => size.value !== size.defaultValue),
      reset: () =>
        onChange(insertRow(config, Object.fromEntries(SIDES.map(({ side }) => [key(side), ""])))),
    };
  };

  return [
    row("Margin", "margin", "de la marge", {
      Top: regular.top,
      Right: 0,
      Bottom: regular.bottom,
      Left: 0,
    }),
    row("Padding", "padding", "du padding", sidesOf(padding)),
  ];
};

/**
 * The margin and padding rows of an Access mode widget, based on its usual
 * margins and on its frame's padding.
 */
export const marginRows = (
  widget: AccessWidget,
  config: Record<string, unknown>,
  onChange: (config: Record<string, unknown>) => void,
  neighbors: Neighbors,
): SettingRow[] =>
  spacingRows(
    regularOf(widget, neighbors, config),
    widget.padding?.(config) ?? (isFramed(config, widget.defaultFrame) ? FRAME_PADDING : 0),
    config,
    onChange,
  );
