import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import dayjs from "dayjs";
import { ALL_OPTION, ChoiceFilter, TextFilter, type FilterOption } from "./ColumnFilters";

// The funnels of the lists' other columns, whatever they hold: a text is
// searched, a choice picked from the values the rows carry, a number
// compared ("> 100", "10-20"), a date limited to a period. A list describes
// its columns once (a record of specs, declared outside the component) and
// places each funnel in its header; all of them narrow the list together,
// along with the list's own filters and its labels ones (useLabelFilter).

/** How a column filters. */
export type ColumnFilterSpec<T> =
  | {
      kind: "text";
      /** The noun of the funnel's tooltip: "nom", "e-mail"… */
      label: string;
      placeholder?: string;
      /** The text searched — several: one of them is enough. */
      text: (row: T) => string | readonly string[] | null | undefined;
    }
  | {
      kind: "choice";
      label: string;
      /** The option that keeps everything: "Tous", "Toutes". */
      all: string;
      /** The values the row offers: the options are those of every row. */
      options: (row: T) => FilterOption[];
      /** Options in a set order (a status…); without it, alphabetical. */
      order?: readonly string[];
    }
  | { kind: "number"; label: string; value: (row: T) => number | null | undefined }
  | {
      kind: "date";
      label: string;
      value: (row: T) => string | null | undefined;
      /** A date to come (a due date): its periods look ahead. */
      ahead?: boolean;
    };

/** A text as searched: without case or accents. */
const plain = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const PAST_PERIODS: FilterOption[] = [
  { value: ALL_OPTION, label: "Toutes les dates" },
  { value: "today", label: "Aujourd'hui" },
  { value: "last7", label: "7 derniers jours" },
  { value: "last30", label: "30 derniers jours" },
  { value: "older", label: "Plus de 30 jours", divider: true },
  { value: "none", label: "Sans date" },
];

const NEXT_PERIODS: FilterOption[] = [
  { value: ALL_OPTION, label: "Toutes les dates" },
  { value: "late", label: "Dépassée" },
  { value: "today", label: "Aujourd'hui" },
  { value: "next7", label: "7 prochains jours" },
  { value: "next30", label: "30 prochains jours", divider: true },
  { value: "none", label: "Sans date" },
];

/** Does the date fall in the period? Counted in days, from today. */
const inPeriod = (date: string | null | undefined, period: string): boolean => {
  if (!date) return period === "none";
  if (period === "none") return false;
  const days = dayjs(date).startOf("day").diff(dayjs().startOf("day"), "day");
  switch (period) {
    case "today":
      return days === 0;
    case "last7":
      return days <= 0 && days > -7;
    case "last30":
      return days <= 0 && days > -30;
    case "older":
      return days <= -30;
    case "late":
      return days < 0;
    case "next7":
      return days >= 0 && days < 7;
    case "next30":
      return days >= 0 && days < 30;
    default:
      return true;
  }
};

/** A number as typed in France: "1 250,5" reads 1250.5. */
const NUMBER = String.raw`-?\d+(?:[.,]\d+)?`;
const RANGE = new RegExp(`^(${NUMBER})(?:-|\\.\\.|à)(${NUMBER})$`);
const COMPARISON = new RegExp(`^(<=|>=|<|>|=)?(${NUMBER})$`);
const toNumber = (text: string): number => Number(text.replace(",", "."));

/**
 * The test a number filter reads: "> 100", "<= 5", "10-20", "42". What does
 * not read as one (a comparison being typed) filters nothing.
 */
const numberTest = (typed: string): ((n: number) => boolean) | null => {
  const text = typed.replace(/[\s\u00a0\u202f€%]/g, "");
  const [, from, to] = RANGE.exec(text) ?? [];
  if (from !== undefined && to !== undefined) {
    const low = Math.min(toNumber(from), toNumber(to));
    const high = Math.max(toNumber(from), toNumber(to));
    return (n) => n >= low && n <= high;
  }
  const [, operator, number] = COMPARISON.exec(text) ?? [];
  if (number === undefined) return null;
  const bound = toNumber(number);
  switch (operator) {
    case "<":
      return (n) => n < bound;
    case "<=":
      return (n) => n <= bound;
    case ">":
      return (n) => n > bound;
    case ">=":
      return (n) => n >= bound;
    default:
      return (n) => n === bound;
  }
};

/** Does the row pass the column's filter, set to "value"? */
const passes = <T,>(spec: ColumnFilterSpec<T>, value: string, row: T): boolean => {
  switch (spec.kind) {
    case "text": {
      const searched = plain(value.trim());
      const texts = spec.text(row);
      return [texts ?? []].flat().some((t) => plain(t).includes(searched));
    }
    case "choice":
      return spec.options(row).some((o) => o.value === value);
    case "number": {
      const test = numberTest(value);
      if (!test) return true;
      const n = spec.value(row);
      return n != null && test(n);
    }
    case "date":
      return inPeriod(spec.value(row), value);
  }
};

/** Is the value one that filters? An empty search, "all", does not. */
const filters = (value: string | undefined): value is string =>
  value !== undefined && value.trim() !== "" && value !== ALL_OPTION;

/**
 * The column filters of a list. "specs" describes its columns: declared
 * outside the component, so that it does not change at each render.
 */
export function useColumnFilters<T, K extends string>(
  rows: readonly T[] | null | undefined,
  specs: Record<K, ColumnFilterSpec<T>>,
) {
  // The value set in each column: a column without one is absent.
  const [values, setValues] = useState<Partial<Record<K, string>>>({});

  /** True when the row passes every column's filter. */
  const keep = useMemo(() => {
    const set = (Object.entries(values) as [K, string | undefined][]).filter(
      (entry): entry is [K, string] => filters(entry[1]),
    );
    return (row: T) => set.every(([key, value]) => passes(specs[key], value, row));
  }, [values, specs]);

  // An empty search or "all" stays stored: it filters nothing.
  const change = (key: K) => (next: string) => setValues((current) => ({ ...current, [key]: next }));

  /** The funnel of a column, in the form its kind asks for. */
  const filter = (key: K): ReactNode => {
    const spec = specs[key];
    if (spec.kind === "choice") {
      const value = values[key] ?? ALL_OPTION;
      const found = new Map<string, string>();
      for (const row of rows ?? []) for (const o of spec.options(row)) found.set(o.value, o.label);
      // The one chosen stays offered even if no row carries it any more.
      if (value !== ALL_OPTION && !found.has(value)) found.set(value, value);
      const options = [...found].map(([v, label]) => ({ value: v, label }));
      const rank = (v: string) => {
        const i = spec.order?.indexOf(v) ?? -1;
        return i < 0 ? Number.MAX_SAFE_INTEGER : i;
      };
      options.sort(
        (a, b) =>
          rank(a.value) - rank(b.value) || a.label.localeCompare(b.label, "fr", { numeric: true }),
      );
      return (
        <ChoiceFilter
          label={spec.label}
          options={[{ value: ALL_OPTION, label: spec.all }, ...options]}
          value={value}
          onChange={change(key)}
        />
      );
    }
    if (spec.kind === "date") {
      return (
        <ChoiceFilter
          label={spec.label}
          options={spec.ahead ? NEXT_PERIODS : PAST_PERIODS}
          value={values[key] ?? ALL_OPTION}
          onChange={change(key)}
        />
      );
    }
    return (
      <TextFilter
        label={spec.label}
        placeholder={spec.kind === "number" ? "Ex. : > 100, 10-20" : spec.placeholder}
        value={values[key] ?? ""}
        onChange={change(key)}
      />
    );
  };

  return {
    keep,
    filter,
    /** At least one column filters. */
    active: (Object.values(values) as (string | undefined)[]).some(filters),
    /** Every column back to no filter. */
    reset: () => setValues({}),
  };
}
