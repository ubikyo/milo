import type { CSSProperties } from "react";
import { insertRow, type SettingRow } from "../components/ui/SettingRows";
import { count, text } from "./types";

// The height of a widget's place: its content's while nothing is chosen
// ("Auto"), otherwise a number of pixels or a share of its section's height.
// It is the place its content is aligned in (widgets/alignment.ts).

const UNIT = "heightUnit";

/** What a new widget stores to start in px, at its usual height (defaultHeight). */
export const PX_HEIGHT = { [UNIT]: "px" } as const;
/** What a new widget stores to start at 100 % of its section's height — a list. */
export const PERCENT_HEIGHT = { [UNIT]: "%" } as const;
const HEIGHT = "height";

const UNITS = [
  { value: "auto", label: "Auto" },
  { value: "px", label: "px" },
  { value: "%", label: "%" },
] as const;

/** What a unit starts at, and how far it goes. */
const BOUNDS = {
  px: { defaultValue: 100, min: 1, max: 2000 },
  "%": { defaultValue: 100, min: 1, max: 100 },
} as const;

type Unit = keyof typeof BOUNDS;

/** The unit chosen; undefined while the height is its content's. */
const unitOf = (config: unknown): Unit | undefined => {
  const unit = text(config, UNIT);
  return unit === "px" || unit === "%" ? unit : undefined;
};

/**
 * What a unit starts at: in px, the widget's own usual height when it gives one
 * — a chart's, with its title and padding —, rounded up to a multiple of 5.
 */
const defaultOf = (unit: Unit, defaultPx?: number): number =>
  unit === "px" && defaultPx !== undefined
    ? Math.min(BOUNDS.px.max, Math.max(BOUNDS.px.min, Math.ceil(defaultPx / 5) * 5))
    : BOUNDS[unit].defaultValue;

const heightOf = (config: unknown, unit: Unit, defaultPx?: number): number =>
  count(config, HEIGHT, defaultOf(unit, defaultPx));

/** True when the place has a height of its own. */
export const isSized = (config: unknown): boolean =>
  unitOf(config) !== undefined;

/**
 * True when it is a share of its section's visible height — the window's,
 * less the column's bands (SectionsBoard, COLUMN_HEIGHT).
 */
export const isPercentHeight = (config: unknown): boolean =>
  unitOf(config) === "%";

/**
 * The style of the place: its height, none while it is "Auto". It holds even
 * for a widget that otherwise takes the height left — a list at the bottom of
 * its section.
 */
export const heightStyle = (
  config: unknown,
  defaultPx?: number,
): CSSProperties => {
  const unit = unitOf(config);
  if (!unit) return {};
  // A share of the column gives way to the widgets above and below it: at
  // 100 %, it takes what they leave.
  if (unit === "%")
    return {
      height: `${heightOf(config, unit)}%`,
      flex: "0 1 auto",
      minHeight: 0,
    };
  return {
    height: `${heightOf(config, unit, defaultPx)}${unit}`,
    flex: "0 0 auto",
  };
};

/**
 * The "Hauteur" row of the drawer's "Apparence" block; "defaultPx": the widget's
 * usual height; "defaultConfig": what a new one stores (PERCENT_HEIGHT).
 */
export const heightRow = (
  config: unknown,
  onChange: (config: Record<string, unknown>) => void,
  defaultPx?: number,
  defaultConfig?: unknown,
): SettingRow => {
  const unit = unitOf(config);
  const percent = isPercentHeight(defaultConfig);
  const defaultValue = unit && defaultOf(unit, defaultPx);
  return {
    name: "Hauteur",
    what: "de la hauteur",
    ...(unit && {
      size: {
        value: heightOf(config, unit, defaultPx),
        ...BOUNDS[unit],
        defaultValue: defaultValue!,
        suffix: ` ${unit}`,
        onChange: (v) =>
          onChange(
            insertRow(config, { [HEIGHT]: v === defaultValue ? "" : v }),
          ),
      },
    }),
    choice: {
      value: unit ?? "auto",
      data: UNITS.map(({ value, label }) => ({ value, label })),
      // Changing unit starts again from its usual height; the one already
      // chosen, clicked again, keeps it.
      onChange: (value) => {
        if (value === (unit ?? "auto")) return;
        onChange(
          insertRow(config, {
            [UNIT]: value === "auto" ? "" : value,
            [HEIGHT]: "",
          }),
        );
      },
    },
    // A widget that starts at 100 % goes back to it; one with a usual height
    // to it, in px; the others to "Auto".
    modified: percent
      ? unit !== "%" || heightOf(config, unit) !== BOUNDS["%"].defaultValue
      : defaultPx === undefined
        ? unit !== undefined
        : unit !== "px" || heightOf(config, unit, defaultPx) !== defaultValue,
    reset: () =>
      onChange(
        insertRow(config, {
          [UNIT]: percent ? "%" : defaultPx === undefined ? "" : "px",
          [HEIGHT]: "",
        }),
      ),
  };
};
