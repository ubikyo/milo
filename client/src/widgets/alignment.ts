import type { CSSProperties } from "react";
import classes from "../assets/styles/Alignment.module.css";
import { insertRow, type SettingRow } from "../components/ui/SettingRows";
import { isSized } from "./height";
import { text } from "./types";

// Where a widget's content sits in its place: vertically — top, middle,
// bottom — and horizontally — left, center, right. Top and left show by
// default. While nothing is chosen, the place is left as is: a list, a chart
// keep their full width, a clock its own centering. A horizontal choice, left
// included, is stored: the content then keeps its own width and moves.
//
// The content moves in its place — the widget's frame when it has one —, and
// the place keeps its height (widgets/height.ts): its content's while nothing
// is set, where a vertical alignment changes nothing.

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

/**
 * What the box holding the widget's content receives: its class and style;
 * nothing while the alignment is the default one.
 */
export const alignmentProps = (
  config: unknown,
  /** True when the widget places its content itself: the box only fills the place. */
  own = false,
): { className?: string; style: CSSProperties } => {
  if (own) return { style: isSized(config) ? { flex: 1, minHeight: 0 } : {} };
  const vertical = verticalOf(config);
  const horizontal = horizontalOf(config);
  const sized = isSized(config);
  if (vertical === VERTICALS[0] && !horizontal && !sized) return { style: {} };
  return {
    className: classes.aligned,
    style: {
      display: "flex",
      flexDirection: "column",
      justifyContent: vertical.css,
      // Without a horizontal choice, the content keeps its full width.
      alignItems: horizontal?.css ?? "stretch",
      ...(horizontal ? { textAlign: horizontal.text } : {}),
      // With a height of its own, the box fills the place: the content moves in it.
      ...(sized ? { flex: 1, minHeight: 0 } : {}),
    },
  };
};

/** What a pair of alignment rows aligns: its keys, its vertical default, what their labels say. */
export interface AlignmentTarget {
  vertical: string;
  horizontal: string;
  defaultVertical: (typeof VERTICALS)[number];
  /** " du nom": after "de l'alignement vertical"; nothing for the whole content. */
  what?: string;
}

/** The "Vertical" and "Horizontal" rows of the drawer's "Apparence" block. */
export const alignmentRows = (
  config: unknown,
  onChange: (config: Record<string, unknown>) => void,
  target: AlignmentTarget = {
    vertical: VERTICAL,
    horizontal: HORIZONTAL,
    defaultVertical: VERTICALS[0],
  },
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
      onChange: (value) =>
        onChange(insertRow(config, { [key]: stored(value) ? value : "" })),
    },
    modified,
    reset: () => onChange(insertRow(config, { [key]: "" })),
  });
  const vertical =
    VERTICALS.find((v) => v.value === text(config, target.vertical)) ??
    target.defaultVertical;
  const horizontal = HORIZONTALS.find(
    (h) => h.value === text(config, target.horizontal),
  );
  const what = target.what ?? "";
  return [
    row(
      "Vertical",
      `de l'alignement vertical${what}`,
      target.vertical,
      VERTICALS,
      vertical.value,
      vertical !== target.defaultVertical,
      (value) => value !== target.defaultVertical.value,
    ),
    row(
      "Horizontal",
      `de l'alignement horizontal${what}`,
      target.horizontal,
      HORIZONTALS,
      (horizontal ?? HORIZONTALS[0]).value,
      horizontal !== undefined,
      () => true,
    ),
  ];
};

// A figure — "Nombre" — aligns its name and its value apart: the name with the
// widget's own keys, the value with its own, at the bottom left by default.

const VALUE_VERTICAL = "valueAlignVertical";
const VALUE_HORIZONTAL = "valueAlignHorizontal";

/** The name's alignment: the widget's own keys. */
export const NAME_ALIGNMENT: AlignmentTarget = {
  vertical: VERTICAL,
  horizontal: HORIZONTAL,
  defaultVertical: VERTICALS[0],
  what: " du nom",
};

/** The value's, at the bottom by default. */
export const VALUE_ALIGNMENT: AlignmentTarget = {
  vertical: VALUE_VERTICAL,
  horizontal: VALUE_HORIZONTAL,
  defaultVertical: VERTICALS[2],
  what: " de la valeur",
};

/**
 * Where the name and the value sit in the card. The free height goes to three
 * gaps — above the name, between them, under the value — by their positions,
 * 0 at the top to 2 at the bottom. The value never goes above the name: placed
 * higher, it follows it.
 */
export const figureLayout = (config: unknown) => {
  const rank = (key: string, fallback: number) => {
    const i = VERTICALS.findIndex((v) => v.value === text(config, key));
    return i < 0 ? fallback : i;
  };
  const textOf = (key: string) =>
    HORIZONTALS.find((h) => h.value === text(config, key))?.text ?? "left";
  const name = rank(VERTICAL, 0);
  const value = Math.max(name, rank(VALUE_VERTICAL, 2));
  return {
    gaps: [name, value - name, 2 - value] as const,
    name: textOf(HORIZONTAL),
    value: textOf(VALUE_HORIZONTAL),
  };
};
