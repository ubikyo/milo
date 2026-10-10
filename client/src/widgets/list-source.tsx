import { Select } from "@mantine/core";
import { useContext } from "react";
import type { ReactNode } from "react";
import { listKey, widgetReference } from "@milo/shared";
import { BoardWidgetsContext } from "../components/ui/IndicatorsPanel";
import type { Indicator } from "../components/ui/IndicatorsPanel";
import { withField } from "./types";
import type { IndicatorConfigProps } from "./support/types";

// The widgets of a data type — projects, tasks, tickets, assets — that count
// rather than list: each reads the items of all the board's lists, unless its
// drawer names one (LIST_SOURCE): it then only reads the items that one shows
// (LIST_KEY).

/** The list widget a counting one follows: its id; absent, all of them. */
export const LIST_SOURCE = "source";

/** The list widget a configuration names; null: all of them. */
const listSourceOf = (config: unknown): number | null => {
  const value = Number((config as Record<string, unknown> | null)?.[LIST_SOURCE]);
  return Number.isInteger(value) && value > 0 ? value : null;
};

/** The board's list widgets of a prefix ("project"…), in column order. */
const useListWidgets = (prefix: string): Indicator<string>[] =>
  useContext(BoardWidgetsContext).filter((w) => w.type === `${prefix}.list`);

/**
 * The list widget a widget follows: the one it names; undefined for all of
 * them — none named, or one since removed.
 */
const useListSource = (prefix: string, config: unknown): Indicator<string> | undefined => {
  const lists = useListWidgets(prefix);
  const chosen = listSourceOf(config);
  return lists.find((w) => w.id === chosen);
};

/** The value of the "all of them" option. */
const ALL = "all";

/**
 * The list key whose items a widget reads; empty for all of them, or for a
 * list not yet saved: everything the board reads then.
 */
export const useListSourceKey = (prefix: string, config: unknown): string => {
  const source = useListSource(prefix, config);
  return source ? listKey(source.config) : "";
};

/**
 * The drawer's "Widget associé" field: all the board's list widgets, or one
 * of them, by its reference alone.
 */
export function ListSourceField({
  prefix,
  config,
  onChange,
}: IndicatorConfigProps & { prefix: string }) {
  const lists = useListWidgets(prefix);
  const source = useListSource(prefix, config);
  return (
    <Select
      label="Widget associé"
      data={[
        { value: ALL, label: "Tous les widgets" },
        ...lists.map((w, rank) => ({
          value: String(w.id),
          label: widgetReference(w.type, w.config) || String(rank + 1),
        })),
      ]}
      value={source ? String(source.id) : ALL}
      onChange={(value) =>
        value && onChange(withField(config, LIST_SOURCE, value === ALL ? null : Number(value)))
      }
      allowDeselect={false}
      w={180}
    />
  );
}

/** What a widget shows, from the list key of the list widget it follows. */
export function FromListSource({
  prefix,
  config,
  children,
}: {
  prefix: string;
  config: unknown;
  children: (key: string) => ReactNode;
}) {
  return <>{children(useListSourceKey(prefix, config))}</>;
}
