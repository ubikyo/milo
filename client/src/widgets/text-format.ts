import { IconItalic, IconLetterG, IconLetterS } from "@tabler/icons-react";
import type { CSSProperties } from "react";
import { insertRow, type SettingRow } from "../components/ui/SettingRows";

// A text's format — bold, italic, underlined —, set in the drawer's
// "Apparence" block: a link's, a title's, the date's, the time's. Each widget
// has its own by default (a title in "H1" is bold, one in "H2" is not); a format
// brought back to the widget's own is no longer stored, so the default keeps
// applying. A widget with several texts — an attribute and its value —
// stores each format under a prefix ("labelBold", "valueBold").

export interface TextFormat {
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

export const NO_FORMAT: TextFormat = { bold: false, italic: false, underline: false };

const FORMATS = ["bold", "italic", "underline"] as const;

/** The configuration key of a format: "bold", or "labelBold" under the prefix "label". */
const keyOf = (format: keyof TextFormat, prefix = ""): string =>
  prefix ? `${prefix}${format.charAt(0).toUpperCase()}${format.slice(1)}` : format;

/** The format in effect: what the configuration sets, otherwise the widget's own. */
export const formatOf = (
  config: unknown,
  defaults: TextFormat = NO_FORMAT,
  prefix = "",
): TextFormat => {
  const own = (config as Record<string, unknown> | null) ?? {};
  const read = (key: keyof TextFormat) => {
    const value = own[keyOf(key, prefix)];
    return typeof value === "boolean" ? value : defaults[key];
  };
  return { bold: read("bold"), italic: read("italic"), underline: read("underline") };
};

/** What forgets a format: its keys, emptied — to merge into a row's reset. */
export const formatReset = (prefix = ""): Record<string, ""> =>
  Object.fromEntries(FORMATS.map((f) => [keyOf(f, prefix), ""]));

/**
 * The format as a style. "boldWeight": what bold means for this widget — a
 * title's level has its own weight, the date its 600.
 */
export const formatStyle = (
  format: TextFormat,
  boldWeight: number | string = 700,
): CSSProperties => ({
  fontWeight: format.bold ? boldWeight : 400,
  fontStyle: format.italic ? "italic" : "normal",
  textDecoration: format.underline ? "underline" : "none",
});

/**
 * The drawer's "Format" row: a button per format, green when on. Its
 * "formats" can also join another row — an attribute's, beside its color —,
 * the reset then merging formatReset.
 */
export const formatRow = (
  config: unknown,
  onChange: (config: Record<string, unknown>) => void,
  defaults: TextFormat = NO_FORMAT,
  prefix = "",
): SettingRow & Required<Pick<SettingRow, "formats">> => {
  const format = formatOf(config, defaults, prefix);
  const set = (key: keyof TextFormat, value: boolean) =>
    onChange(insertRow(config, { [keyOf(key, prefix)]: value === defaults[key] ? "" : value }));
  return {
    name: "Format",
    what: "du format",
    formats: [
      { key: "bold" as const, label: "Gras", icon: IconLetterG },
      { key: "italic" as const, label: "Italique", icon: IconItalic },
      { key: "underline" as const, label: "Souligné", icon: IconLetterS },
    ].map(({ key, label, icon }) => ({
      label,
      icon,
      value: format[key],
      onChange: (v: boolean) => set(key, v),
    })),
    modified: FORMATS.some((k) => format[k] !== defaults[k]),
    reset: () => onChange(insertRow(config, formatReset(prefix))),
  };
};
