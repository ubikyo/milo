import { Stack, TextInput, Title } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { editKeys } from "../../components/ui/DrawerRows";
import { insertRow, type SettingRow } from "../../components/ui/SettingRows";
import { styleOf, styledConfig, useTitleStyles } from "../../lib/titleStyles";
import { formatOf, formatRow, formatStyle } from "../text-format";
import type { TextFormat } from "../text-format";
import { withField, count, text } from "../types";
import type { AccessWidget, WidgetDisplayProps } from "../types";
import type { ComponentType } from "react";
import { TITLE_STYLE } from "@milo/shared";
import type { AccessBlockType } from "@milo/shared";

// The titles of a column, edited where they stand by double click.
//
// Either can take a style (lib/titleStyles.ts): its appearance then comes from
// it — color, size, format, frame, margins, padding — instead of its own. What
// the style leaves out is its base's usual value (defineTitleLook): a title
// in "H2" reads one step lower, weight and spacing included.

const TITLE = "title";
const COLOR = "color";
const SIZE = "size";

/**
 * The size bounds: below them the title is no longer legible, above them it
 * overflows the column.
 */
const SIZE_MIN = 8;
const SIZE_MAX = 64;

/** A title's usual look: what a style leaves out comes from its base's. */
interface TitleLook {
  /** The title's level: "H2" comes under "H1". */
  order: 1 | 2;
  /** The default size, which the configuration can override. */
  size: number;
  /** The title's weight; by default, that of its level. */
  weight?: number;
  /** The default color, in hexadecimal: the picker shows it as is. */
  color: string;
  /** The space left before what follows in the column. */
  lowMargin: number;
  /**
   * The space left above when an element precedes it. At the head of a column,
   * the title takes none: there is nothing to set apart. It can depend on the
   * type of that element.
   */
  highMargin?: number | ((previousType: AccessBlockType) => number);
}

interface TitleOptions extends TitleLook {
  type: AccessBlockType;
  label: string;
  icon: ComponentType<{ size?: number }>;
  /** What a still-empty title shows: the space it takes, and nothing more. */
  placeholder: string;
  /**
   * The style a title takes (lib/titleStyles.ts) when it names none: it then
   * always has one. Without it, it can have none.
   */
  style?: string;
}

/** The look of each style base (TitleStyle.base): a title's, "H2"'s. */
const LOOKS = new Map<string, TitleLook>();

/** Declares a style base's look, under its name — "subcategory" for "H2". */
export const defineTitleLook = (base: string, look: TitleLook) => {
  LOOKS.set(base, look);
};

/**
 * The options whose usual values apply to this title: its style's base,
 * otherwise its own.
 */
const optionsOf = (config: unknown, options: TitleOptions): TitleOptions => {
  const base = styleOf(config, options.style)?.base;
  const look = base ? LOOKS.get(base) : undefined;
  return look ? { ...options, ...look } : options;
};

/** The drawer's "Texte" row: the title's color and size — or its style's. */
const textLine = (
  config: unknown,
  onChange: (config: Record<string, unknown>) => void,
  own: TitleOptions,
): SettingRow => {
  const options = optionsOf(config, own);
  const color = text(config, COLOR);
  const size = count(config, SIZE, options.size);
  return {
    name: "Texte",
    what: "du titre",
    // The field shows the title's own color while nothing is set; brought
    // back to it, a color is no longer stored.
    color: {
      value: color || options.color,
      onChange: (v) => onChange(insertRow(config, { [COLOR]: v === options.color ? "" : v })),
    },
    size: {
      value: size,
      defaultValue: options.size,
      min: SIZE_MIN,
      max: SIZE_MAX,
      onChange: (v) => onChange(insertRow(config, { [SIZE]: v === options.size ? "" : v })),
    },
    modified: (color !== "" && color !== options.color) || size !== options.size,
    reset: () => onChange(insertRow(config, { [COLOR]: "", [SIZE]: "" })),
  };
};

/** A title's own format: bold when its level's weight is, never italic nor underlined. */
const defaultFormat = (options: TitleOptions): TextFormat => ({
  bold: (options.weight ?? 700) >= 600,
  italic: false,
  underline: false,
});

/** What bold means for a title: its own weight if it is bold, otherwise its level's. */
const boldWeight = (options: TitleOptions): number | string =>
  options.weight !== undefined && options.weight >= 600
    ? options.weight
    : `var(--mantine-h${options.order}-font-weight)`;

const display = (own: TitleOptions): ComponentType<WidgetDisplayProps> =>
  function EditableTitle({ config, onChange }: WidgetDisplayProps) {
    const [editMode, setEditing] = useState(false);
    const [draft, setDraft] = useState("");
    // The title that has just been entered, until the server sends it back:
    // without it, the old one would reappear for a moment between the entry
    // and the response.
    const [pending, setPending] = useState<string | null>(null);
    const field = useRef<HTMLInputElement | null>(null);

    // Subscribed: a style changed elsewhere redraws the titles that use it.
    useTitleStyles();
    const shown = styledConfig(config, own.style);
    const options = optionsOf(config, own);
    const saved = text(config, TITLE);
    const size = count(shown, SIZE, options.size);
    const color = text(shown, COLOR, options.color) || options.color;
    const format = formatStyle(formatOf(shown, defaultFormat(options)), boldWeight(options));
    const title = pending ?? saved;

    // The field takes focus as soon as it appears, and the input is already
    // selected there: the double click means "I replace this title".
    useEffect(() => {
      if (!editMode) return;
      field.current?.focus();
      field.current?.select();
    }, [editMode]);

    const openItem = () => {
      setDraft(title);
      setEditing(true);
    };

    // The title goes to the server when the input closes — it is the only
    // gesture it carries. Unchanged, nothing is sent.
    const close = async () => {
      setEditing(false);
      const newValue = draft.trim();
      if (newValue === title) return;
      setPending(newValue);
      try {
        await onChange(withField(config, TITLE, newValue));
      } finally {
        // The reread configuration takes over — or, if the server refused,
        // the saved title reappears.
        setPending(null);
      }
    };

    if (editMode) {
      return (
        <TextInput
          ref={field}
          aria-label={own.label}
          placeholder={options.placeholder}
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onBlur={close}
          onKeyDown={(e) => {
            if (e.key === "Enter") close();
            // Escape gives up: the previous title stays.
            if (e.key === "Escape") setEditing(false);
          }}
          // The field takes exactly the place of the title it replaces,
          // otherwise the row — and everything after it — would jump on
          // double click. Mantine leaves two things on an "unstyled" field: a
          // one-pixel transparent border, and a minimum height of 36 pixels,
          // far more than the line of a 16 or 18 title. Both are removed, and
          // the weight and line height are taken from the title level rather
          // than guessed.
          variant="unstyled"
          styles={{
            input: {
              fontSize: size,
              ...format,
              lineHeight: `var(--mantine-h${options.order}-line-height)`,
              color: color,
              height: "auto",
              minHeight: 0,
              border: "none",
            },
          }}
        />
      );
    }

    return (
      <Title
        order={options.order}
        size={size}
        fw={options.weight}
        onDoubleClick={openItem}
        c={color}
        // The hand: the title is double-clicked, not typed into where it
        // stands — the caret would suggest one is already writing in it.
        // A still-empty title keeps its color: it is the same title, it is
        // only waiting for its name.
        style={{ ...format, cursor: "pointer" }}
      >
        {title || options.placeholder}
      </Title>
    );
  };

/** A title's widget, from what distinguishes it from the other. */
export const createWidgetTitle = (options: TitleOptions): AccessWidget => {
  LOOKS.set(options.type, options);
  return {
    type: options.type,
    // Titles are widgets shared by all modes.
    kind: "common",
    label: options.label,
    icon: options.icon,
    // A new title is empty: it is named by double-clicking it, where it
    // stands, rather than in a drawer that would open right away.
    defaultConfig: { [TITLE]: "", ...(options.style ? { [TITLE_STYLE]: options.style } : {}) },
    inlineEdit: true,
    ownClicks: true,
    styled: (config) => styledConfig(config, options.style),
    ...(options.style ? { defaultStyle: options.style } : {}),

    Display: display(options),

    margins: (previousType, _nextType, config) => {
      const o = optionsOf(config, options);
      return {
        top:
          previousType === null
            ? 0
            : typeof o.highMargin === "function"
              ? o.highMargin(previousType)
              : (o.highMargin ?? 0),
        bottom: o.lowMargin,
      };
    },

    appearance: (config, onChange) => [
      textLine(config, onChange, options),
      formatRow(config, onChange, defaultFormat(optionsOf(config, options))),
    ],

    Config: ({ config, onChange }) => (
      <Stack gap="xl">
        <TextInput
          label="Titre"
          placeholder={options.placeholder}
          value={text(config, TITLE)}
          onChange={(e) => onChange(withField(config, TITLE, e.currentTarget.value))}
          {...editKeys((value) => onChange(withField(config, TITLE, value)))}
          autoFocus
        />
      </Stack>
    ),
  };
};
