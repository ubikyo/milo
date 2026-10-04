import { insertRow, type SettingRow } from "../components/ui/SettingRows";
import { count } from "./types";
import type { AccessWidget, Margins } from "./types";
import type { BoardWidget, AccessBlockType } from "@milo/shared";

// The space above and below a column element.
//
// Each widget says the one it usually leaves, depending on what surrounds it
// ("margins"). The configuration can override it, element by element: its two
// fields are stored only when they differ from that usual value, so that an
// element left as is still follows its neighbors when it is moved.

const HIGH_MARGIN = "marginTop";
const LOW_MARGIN = "marginBottom";

/** Beyond that, the element would get lost far from its column. */
const MARGIN_MAX = 200;

interface Neighbors {
  previousType: AccessBlockType | null;
  nextType: AccessBlockType | null;
}

/** A margin stored in the configuration, or "null": the widget's usual one applies. */
const configured = (config: unknown, key: string): number | null => {
  const readValue = count(config, key, Number.NaN);
  return Number.isNaN(readValue) ? null : readValue;
};

/** The elements that open a group: the space before them is their own. */
const TITLES: AccessBlockType[] = ["category", "subcategory"];

/**
 * The widget's usual space, except before a category or a subcategory: the
 * element leaves nothing below itself there, the title alone setting the gap
 * that separates it.
 */
const regularOf = (widget: AccessWidget, { previousType, nextType }: Neighbors): Margins => {
  const regular = widget.margins(previousType, nextType);
  return nextType !== null && TITLES.includes(nextType) ? { ...regular, bottom: 0 } : regular;
};

/** The space the element really leaves: its own, or that of its configuration. */
export const marginsOf = (
  widget: AccessWidget,
  config: unknown,
  neighbors: Neighbors,
): Margins => {
  return configuredMargins(config, regularOf(widget, neighbors));
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
 * The two margin rows, at the end of the drawer's "Apparence" block
 * (SettingRows), for any widget: they show the margin in effect —
 * "ordinaires" as long as nothing is set. Bringing a field back to the usual
 * value, clearing it or clicking its button removes the setting.
 */
export const marginRowsFor = (
  regular: Margins,
  config: unknown,
  onChange: (config: Record<string, unknown>) => void,
): SettingRow[] => {
  const current = configuredMargins(config, regular);

  const adjust = (key: string, regular: number, value: number | "") =>
    onChange(insertRow(config, { [key]: value === regular ? "" : value }));

  const row = (
    name: string,
    what: string,
    key: string,
    value: number,
    regular: number,
  ): SettingRow => ({
    name,
    what,
    size: {
      value,
      defaultValue: regular,
      min: 0,
      max: MARGIN_MAX,
      onChange: (v) => adjust(key, regular, v),
    },
    modified: value !== regular,
    reset: () => adjust(key, regular, ""),
  });

  return [
    row("Haut", "de la marge haute", HIGH_MARGIN, current.top, regular.top),
    row("Bas", "de la marge basse", LOW_MARGIN, current.bottom, regular.bottom),
  ];
};

/** The margin rows of an Access mode widget, based on its usual value. */
export const marginRows = (
  widget: AccessWidget,
  config: Record<string, unknown>,
  onChange: (config: Record<string, unknown>) => void,
  neighbors: Neighbors,
): SettingRow[] => marginRowsFor(regularOf(widget, neighbors), config, onChange);
