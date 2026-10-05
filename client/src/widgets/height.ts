import type { CSSProperties } from "react";
import { insertRow, type SettingRow } from "../components/ui/SettingRows";
import { count, text } from "./types";

// The height of a widget's place: its content's while nothing is chosen
// ("Auto"), otherwise a number of pixels or a share of its section's height.
// It is the place its content is aligned in (widgets/alignment.ts).

const UNIT = "heightUnit";
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

const heightOf = (config: unknown, unit: Unit): number =>
  count(config, HEIGHT, BOUNDS[unit].defaultValue);

/** True when the place has a height of its own. */
export const isSized = (config: unknown): boolean => unitOf(config) !== undefined;

/**
 * True when it is a share of its section's visible height — the window's,
 * less the column's bands (SectionsBoard, COLUMN_HEIGHT).
 */
export const isPercentHeight = (config: unknown): boolean => unitOf(config) === "%";

/**
 * The style of the place: its height, none while it is "Auto". It holds even
 * for a widget that otherwise takes the height left — a list at the bottom of
 * its section.
 */
export const heightStyle = (config: unknown): CSSProperties => {
  const unit = unitOf(config);
  if (!unit) return {};
  // A share of the column gives way to the widgets above and below it: at
  // 100 %, it takes what they leave.
  if (unit === "%") return { height: `${heightOf(config, unit)}%`, flex: "0 1 auto", minHeight: 0 };
  return { height: `${heightOf(config, unit)}${unit}`, flex: "0 0 auto" };
};

/** The "Hauteur" row of the drawer's "Apparence" block. */
export const heightRow = (
  config: unknown,
  onChange: (config: Record<string, unknown>) => void,
): SettingRow => {
  const unit = unitOf(config);
  return {
    name: "Hauteur",
    what: "de la hauteur",
    ...(unit && {
      size: {
        value: heightOf(config, unit),
        ...BOUNDS[unit],
        suffix: ` ${unit}`,
        onChange: (v) =>
          onChange(insertRow(config, { [HEIGHT]: v === BOUNDS[unit].defaultValue ? "" : v })),
      },
    }),
    choice: {
      value: unit ?? "auto",
      data: UNITS.map(({ value, label }) => ({ value, label })),
      // Changing unit starts again from its usual height; the one already
      // chosen, clicked again, keeps it.
      onChange: (value) => {
        if (value === (unit ?? "auto")) return;
        onChange(insertRow(config, { [UNIT]: value === "auto" ? "" : value, [HEIGHT]: "" }));
      },
    },
    modified: unit !== undefined,
    reset: () => onChange(insertRow(config, { [UNIT]: "", [HEIGHT]: "" })),
  };
};
