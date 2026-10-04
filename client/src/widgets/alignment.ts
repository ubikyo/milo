import type { CSSProperties } from "react";
import classes from "../assets/styles/Alignment.module.css";
import { insertRow, type SettingRow } from "../components/ui/SettingRows";
import { text } from "./types";

// Where a widget's content sits in its place: vertically — top, middle,
// bottom — and horizontally — left, center, right. Top and left show by
// default. While nothing is chosen, the place is left as is: a list, a chart
// keep their full width, a clock its own centering. A horizontal choice, left
// included, is stored: the content then keeps its own width and moves.
//
// Aligned vertically, a widget takes the height its section has left — shared
// with the others aligned so —: that is the place its content moves in.

const VERTICAL = "alignVertical";
const HORIZONTAL = "alignHorizontal";

const VERTICALS = [
  { value: "top", label: "Haut", css: "flex-start" },
  { value: "middle", label: "Milieu", css: "center" },
  { value: "bottom", label: "Bas", css: "flex-end" },
] as const;

const HORIZONTALS = [
  { value: "left", label: "Gauche", css: "flex-start", text: "left" },
  { value: "center", label: "Centre", css: "center", text: "center" },
  { value: "right", label: "Droit", css: "flex-end", text: "right" },
] as const;

const verticalOf = (config: unknown) =>
  VERTICALS.find((v) => v.value === text(config, VERTICAL)) ?? VERTICALS[0];
/** The horizontal alignment chosen; undefined while none is. */
const horizontalOf = (config: unknown) =>
  HORIZONTALS.find((h) => h.value === text(config, HORIZONTAL));

/** True when the widget is aligned other than at the top: it takes its section's height. */
export const isVerticallyAligned = (config: unknown): boolean =>
  verticalOf(config) !== VERTICALS[0];

/**
 * What the box holding the widget's content receives: its class and style;
 * nothing while the alignment is the default one.
 */
export const alignmentProps = (
  config: unknown,
): { className?: string; style: CSSProperties } => {
  const vertical = verticalOf(config);
  const horizontal = horizontalOf(config);
  if (vertical === VERTICALS[0] && !horizontal) return { style: {} };
  return {
    className: classes.aligned,
    style: {
      display: "flex",
      flexDirection: "column",
      justifyContent: vertical.css,
      // Without a horizontal choice, the content keeps its full width.
      alignItems: horizontal?.css ?? "stretch",
      ...(horizontal ? { textAlign: horizontal.text } : {}),
      // Aligned vertically, the content moves in the whole place.
      ...(vertical !== VERTICALS[0] ? { flex: 1, minHeight: 0 } : {}),
    },
  };
};

/** The "Vertical" and "Horizontal" rows of the drawer's "Apparence" block. */
export const alignmentRows = (
  config: unknown,
  onChange: (config: Record<string, unknown>) => void,
): SettingRow[] => {
  // "stored": the default is not stored for the vertical alignment — top is
  // where every widget already sits —, any choice is for the horizontal one.
  const row = (
    name: string,
    what: string,
    key: string,
    options: readonly { value: string; label: string }[],
    current: string,
    modified: boolean,
    stored: (value: string) => boolean,
  ): SettingRow => ({
    name,
    what,
    choice: {
      value: current,
      data: options.map(({ value, label }) => ({ value, label })),
      onChange: (value) => onChange(insertRow(config, { [key]: stored(value) ? value : "" })),
    },
    modified,
    reset: () => onChange(insertRow(config, { [key]: "" })),
  });
  const vertical = verticalOf(config);
  const horizontal = horizontalOf(config);
  return [
    row(
      "Vertical",
      "de l'alignement vertical",
      VERTICAL,
      VERTICALS,
      vertical.value,
      vertical !== VERTICALS[0],
      (value) => value !== VERTICALS[0].value,
    ),
    row(
      "Horizontal",
      "de l'alignement horizontal",
      HORIZONTAL,
      HORIZONTALS,
      (horizontal ?? HORIZONTALS[0]).value,
      horizontal !== undefined,
      () => true,
    ),
  ];
};
