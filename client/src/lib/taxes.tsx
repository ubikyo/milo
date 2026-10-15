// The taxes of the Taxes widgets (shared, taxes.ts): a Taxes widget shows its
// own — its drawer writes them (TaxTablesFields) —; a Produits widget, a
// declared asset's widget offer those of the Taxes widgets they name
// (TAX_SOURCES), of any board one sees. Each
// re-reads when the server says they changed (App.tsx).

import { Group, Text } from "@mantine/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TAX_LIST_TYPE, TAX_SOURCES, taxLabel } from "@milo/shared";
import type { ComboboxItem, ComboboxLikeRenderOptionInput } from "@mantine/core";
import type { ListRef, Tax } from "@milo/shared";
import { api } from "../api";
import { errorMessage, notifyError } from "./errors";
import { listRefKey } from "./list-ref";
import { onResources, useSources } from "./sources";

/** A Taxes widget's taxes, "null" while they are read, and what replaces them once written. */
export function useTaxList(ref: ListRef | null): { taxes: Tax[] | null; setTaxes: (taxes: Tax[]) => void } {
  const [taxes, setTaxes] = useState<Tax[] | null>(null);
  const key = listRefKey(ref);

  const reload = useCallback(async () => {
    if (!ref) return;
    try {
      setTaxes(await api.getTaxes(ref));
    } catch (e) {
      notifyError(errorMessage(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    void reload();
    return onResources(["taxes"], () => void reload());
  }, [reload]);

  return { taxes, setTaxes };
}

/**
 * The taxes a widget offers: those of the Taxes widgets its configuration
 * names, in their order — a rate once, the first one's name. Empty while
 * they are read, or without one.
 */
export function useOfferedTaxes(config: unknown): Tax[] {
  const sources = useSources(TAX_LIST_TYPE, config, TAX_SOURCES);
  const key = sources.map((s) => `${s.board_id}\n${s.key}`).join("|");
  const [read, setRead] = useState<Tax[][]>([]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      Promise.all(sources.map((s) => api.getTaxes({ board: s.board_id, list: s.key })))
        .then((lists) => alive && setRead(lists))
        .catch((e) => notifyError(errorMessage(e)));
    setRead([]);
    void load();
    const stop = onResources(["taxes"], () => void load());
    return () => {
      alive = false;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return useMemo(() => {
    const seen = new Set<number>();
    return read.flat().filter((t) => !seen.has(t.rate) && Boolean(seen.add(t.rate)));
  }, [read]);
}

/**
 * The choice of a price's tax among those offered, by its rate as a string:
 * the field shows the rate, the list its name, then the rate at the end. A
 * rate the price holds, no longer offered, still shows.
 */
export const taxChoice = (taxes: Tax[], own: string | null) => {
  const names = new Map(taxes.map((t) => [String(t.rate), t.name]));
  const data: ComboboxItem[] = taxes.map((t) => ({ value: String(t.rate), label: taxLabel(t.rate) }));
  if (own !== null && !names.has(own)) data.push({ value: own, label: taxLabel(Number(own)) });
  return {
    data,
    renderOption: ({ option }: ComboboxLikeRenderOptionInput<ComboboxItem>) => (
      <Group gap="xs" wrap="nowrap" justify="space-between" w="100%">
        {names.get(option.value) && (
          <Text size="sm" style={{ whiteSpace: "nowrap" }}>
            {names.get(option.value)}
          </Text>
        )}
        <Text size="sm" c="dimmed" ml="auto" style={{ whiteSpace: "nowrap" }}>
          {option.label}
        </Text>
      </Group>
    ),
    // The names widen the list beyond the narrow field.
    comboboxProps: { width: "max-content" as const, position: "bottom-end" as const },
  };
};
