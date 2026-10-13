import { Select } from "@mantine/core";
import { useMemo } from "react";
import type { Actor, LabelsBase } from "@milo/shared";
import { dueState } from "../../lib/due";
import { useSourceLabelGroups, useSources } from "../../lib/sources";
import { CHART_COLORS, colorOf } from "../chart-colors";
import { withField } from "../types";
import type { Dimension, Slice, SourceContext } from "./types";

// The dimensions several sources share: a field read as is, fixed bands, the
// actors, the labels, the due dates.

/** A dimension whose slices the item gives itself, by a field. */
export const plainDimension = <Item,>(
  value: string,
  label: string,
  slices: (item: Item) => Slice[],
  more: Partial<Dimension<Item>> = {},
): Dimension<Item> => ({
  value,
  label,
  useSlicer: () => ({ slices }),
  ...more,
});

/** One slice named by a text, none for an empty one. */
export const named = (value: string | null | undefined): Slice[] => {
  const name = (value ?? "").trim();
  return name ? [{ key: name.toLowerCase(), name }] : [];
};

/** A fixed band: where its color is stored, its slice, its name, its color, what it shows. */
export interface Band {
  key: string;
  slice: string;
  name: string;
  color: string;
  what: string;
}

/**
 * A dimension of fixed bands, in their order — statuses, ages, due dates —:
 * each in its color, which the chart's appearance changes. "of" says the
 * band an item falls in; none, it is left out.
 */
export const bandDimension = <Item,>(
  value: string,
  label: string,
  bands: Band[],
  of: (item: Item) => string | null,
  more: Partial<Dimension<Item>> = {},
): Dimension<Item> => ({
  value,
  label,
  ownColors: true,
  parts: bands,
  useSlicer: ({ config }: SourceContext) => {
    const fixed = bands.map((b) => ({ key: b.slice, name: b.name, color: colorOf(config, b.key, b.color) }));
    const byKey = new Map(fixed.map((s) => [s.key, s]));
    return {
      fixed,
      slices: (item: Item) => {
        const slice = byKey.get(of(item) ?? "");
        return slice ? [slice] : [];
      },
    };
  },
  ...more,
});

/** Who carries an item: each actor is a slice, an item with two counts for each. */
export const actorsDimension = <Item,>(
  value: string,
  label: string,
  of: (item: Item) => Actor[],
): Dimension<Item> =>
  plainDimension(value, label, (item) => of(item).map((a) => ({ key: String(a.id), name: a.name })), {
    empty: "Personne",
  });

/** The due date bands — the same rule as the cards' (lib/due) —, and where their colors were stored. */
const DUE_BANDS: Band[] = [
  { key: "colorLate", slice: "late", name: "En retard", color: CHART_COLORS.red, what: "des échéances en retard" },
  { key: "colorSoon", slice: "soon", name: "Bientôt", color: CHART_COLORS.orange, what: "des échéances proches" },
  { key: "colorLater", slice: "later", name: "À venir", color: CHART_COLORS.green, what: "des échéances à venir" },
  { key: "colorNone", slice: "none", name: "Sans échéance", color: CHART_COLORS.gray5, what: "de l'absence d'échéance" },
];

/** Where the due dates stand: past, near, far, or absent. */
export const dueDimension = <Item,>(of: (item: Item) => string): Dimension<Item> =>
  bandDimension("due", "Échéances", DUE_BANDS, (item) => {
    const due = of(item);
    if (!due) return "none";
    const state = dueState(due);
    return state === "late" ? "late" : state === "soon" ? "soon" : "later";
  });

/** The configuration key: the label group's name, absent for all labels. */
const GROUP = "label_group_name";

const groupOf = (config: unknown): string | null => {
  const value = (config as Record<string, unknown> | null)?.[GROUP];
  return typeof value === "string" && value.trim() ? value : null;
};

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const ALL = "all";

/**
 * The labels carried, each in its color: all of them, or those of one group,
 * chosen by its name — the widgets read each have their own groups —; labels
 * of the same name count together.
 */
export const labelsDimension = <Item,>(
  base: LabelsBase,
  listType: string,
  of: (item: Item) => { name: string; color: string; group_id: number }[],
): Dimension<Item> => ({
  value: "labels",
  label: "Étiquettes",
  ownColors: true,
  useSlicer: ({ sources, config }) => {
    const groups = useSourceLabelGroups(base, sources);
    const group = groupOf(config);
    return useMemo(() => {
      const names = new Map(groups.map((g) => [g.id, g.name]));
      return {
        slices: (item: Item) =>
          of(item)
            .filter((l) => group === null || same(names.get(l.group_id) ?? "", group))
            .map((l) => ({ key: l.name.trim().toLowerCase(), name: l.name, color: l.color })),
      };
    }, [groups, group]);
  },
  Config: function LabelGroupSelect({ config, onChange }) {
    const sources = useSources(listType, config);
    const groups = useSourceLabelGroups(base, sources);
    const names = [...new Map(groups.map((g) => [g.name.trim().toLowerCase(), g.name.trim()])).values()];
    const group = groupOf(config);
    const chosen = group === null ? ALL : (names.find((n) => same(n, group)) ?? group);
    return (
      <Select
        label="Étiquettes affichées"
        data={[
          { value: ALL, label: "Toutes les étiquettes" },
          ...names.map((name) => ({ value: name, label: name })),
          // A group none of the widgets has any more stays chosen: it says so.
          ...(group !== null && !names.some((n) => same(n, group))
            ? [{ value: group, label: `${group} (introuvable)` }]
            : []),
        ]}
        value={chosen}
        onChange={(value) => value && onChange(withField(config, GROUP, value === ALL ? null : value))}
        allowDeselect={false}
      />
    );
  },
});
