import { useMemo } from "react";
import type { ReactNode } from "react";
import type { Id } from "@milo/shared";
import { ofGroup } from "../../lib/label-groups";
import { ALL_OPTION, ChoiceFilter, type FilterOption } from "./ColumnFilters";
import { readTexts, useGridState } from "../../lib/gridStates";

// The funnel of the lists' labels columns. A column limited to a group
// offers that group's labels only, and filters on them; a column showing
// every label, all of them. Each column filters on its own: two columns of
// two groups narrow the list together.

/** What a label carries that matters here: its name, its group, its place. */
interface FilteredLabel {
  name: string;
  group_id: Id;
  position: number;
}

/** A column's key in the chosen filters: its group, or "" for all the labels. */
const keyOf = (group: Id | null | undefined): string => (group == null ? "" : String(group));

/**
 * The labels filters of a list. "labelsOf" reads a row's labels: declared
 * outside the component, so that it does not change at each render. They are
 * kept for the person, in the widget's scope (lib/gridStates).
 */
export function useLabelFilter<T>(
  rows: readonly T[] | null | undefined,
  labelsOf: (row: T) => FilteredLabel[],
) {
  // The label chosen in each column, by group: a column without one is absent.
  const [chosen, setChosen] = useGridState<Partial<Record<string, string>>>(
    "labels",
    {},
    readTexts<string>(),
  );

  /** True when the row carries, in each filtered column's group, the label chosen there. */
  const keep = useMemo(() => {
    const filters = Object.entries(chosen).map(
      ([key, name]) => [key === "" ? null : Number(key), name] as const,
    );
    return (row: T) =>
      filters.every(([group, name]) => ofGroup(labelsOf(row), group).some((l) => l.name === name));
  }, [chosen, labelsOf]);

  /** The funnel of a labels column, limited to its group's labels. */
  const filter = (group: Id | null | undefined): ReactNode => {
    const key = keyOf(group);
    const value = chosen[key] ?? ALL_OPTION;
    // The labels the rows carry in this group; the one chosen stays offered
    // even if no row carries it any more.
    const names = new Set((rows ?? []).flatMap((r) => ofGroup(labelsOf(r), group).map((l) => l.name)));
    if (value !== ALL_OPTION) names.add(value);
    const options: FilterOption[] = [
      { value: ALL_OPTION, label: "Toutes" },
      ...[...names].sort((a, b) => a.localeCompare(b, "fr")).map((n) => ({ value: n, label: n })),
    ];
    return (
      <ChoiceFilter
        label="étiquette"
        options={options}
        value={value}
        onChange={(next) =>
          setChosen((current) => {
            const { [key]: _removed, ...others } = current;
            return next === ALL_OPTION ? others : { ...others, [key]: next };
          })
        }
      />
    );
  };

  return {
    keep,
    filter,
    /** At least one labels column filters. */
    active: Object.keys(chosen).length > 0,
    /** Every labels column back to "Toutes". */
    reset: () => setChosen({}),
  };
}
