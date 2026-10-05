// The styles of the titles: a named appearance
// that several titles share. They apply to the whole application, not to an
// account or a board: the same "Section" style reads alike everywhere.
//
// A style carries the same keys as a title's configuration — color, size,
// format, frame, margins, padding —, under the same names: a title that uses it reads
// them from it instead of its own. A key left out keeps the title's usual
// value.

export interface TitleStyle {
  /** Chosen by the client; what a title stores to designate its style. */
  id: string;
  name: string;
  config: Record<string, unknown>;
  /**
   * The type of title whose usual appearance fills what the style leaves out
   * — "category" for "H1", "subcategory" for "H2", the look of the former
   * subcategory widget (client/src/widgets/common/h2.tsx). Without it, the title that uses it keeps its own.
   */
  base?: string;
}

/** The longest name: beyond, it no longer fits in a menu. */
export const TITLE_STYLE_NAME_MAX = 60;

/** The configuration keys a style sets: everything else stays the title's. */
export const TITLE_STYLE_KEYS = [
  "color",
  "size",
  "framed",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "bold",
  "italic",
  "underline",
] as const;

/** The configuration key holding the style's identifier. */
export const TITLE_STYLE = "style";

/** The style a new title takes. */
export const H1_STYLE = "h1";

/** The style one step lower than "H1": what subcategories became. */
export const H2_STYLE = "h2";

/**
 * "H1" and "H2", which always exist: their appearance can be changed, they
 * are neither renamed nor deleted. With nothing set, each is the usual
 * appearance of its base: a title's for "H1", one step lower for "H2".
 */
export const BUILT_IN_TITLE_STYLES: TitleStyle[] = [
  { id: H1_STYLE, name: "H1", config: {}, base: "category" },
  { id: H2_STYLE, name: "H2", config: {}, base: "subcategory" },
];

export const isBuiltInTitleStyle = (id: string): boolean =>
  BUILT_IN_TITLE_STYLES.some((s) => s.id === id);

/**
 * A widget of a type that no longer exists, as the one that replaced it: a
 * subcategory is a title in "H2" — its own style kept, if it had chosen one.
 * Read by the migration of the database and by the import of a layout
 * exported before.
 */
export const currentWidget = (
  type: unknown,
  config: unknown,
): { type: unknown; config: unknown } => {
  if (type !== "subcategory") return { type, config };
  const own = config && typeof config === "object" ? (config as Record<string, unknown>) : {};
  return {
    type: "category",
    config: typeof own[TITLE_STYLE] === "string" ? own : { ...own, [TITLE_STYLE]: H2_STYLE },
  };
};
