import { Stack, TextInput, Title } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { insertRow, type SettingRow } from "../../components/ui/SettingRows";
import { withField, count, text } from "../types";
import type { AccessWidget, WidgetDisplayProps } from "../types";
import type { ComponentType } from "react";
import type { AccessBlockType } from "@milo/shared";

// The titles of a column: the category, and the subcategory below it. The
// same object at two levels — a title that is edited where it stands, by
// double click — and nothing distinguishes them but their size, their color
// and the space they leave below. They are therefore described once here, and
// each only has to state those three.

const TITLE = "title";
const COLOR = "color";
const SIZE = "size";

/**
 * The size bounds: below them the title is no longer legible, above them it
 * overflows the column.
 */
const SIZE_MIN = 8;
const SIZE_MAX = 64;

interface TitleOptions {
  type: AccessBlockType;
  label: string;
  icon: ComponentType<{ size?: number }>;
  /** The title's level: the subcategory comes under the category. */
  order: 1 | 2;
  /** What a still-empty title shows: the space it takes, and nothing more. */
  placeholder: string;
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

/** The drawer's "Texte" row: the title's color and size. */
const textLine = (
  config: unknown,
  onChange: (config: Record<string, unknown>) => void,
  options: TitleOptions,
): SettingRow => {
  const color = text(config, COLOR);
  const size = count(config, SIZE, options.size);
  return {
    name: "Texte",
    what: "du titre",
    // The title's color, brought back to its own, is no longer stored.
    color: {
      value: color,
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

const display = (options: TitleOptions): ComponentType<WidgetDisplayProps> =>
  function EditableTitle({ config, onChange }: WidgetDisplayProps) {
    const [editMode, setEditing] = useState(false);
    const [draft, setDraft] = useState("");
    // The title that has just been entered, until the server sends it back:
    // without it, the old one would reappear for a moment between the entry
    // and the response.
    const [pending, setPending] = useState<string | null>(null);
    const field = useRef<HTMLInputElement | null>(null);

    const saved = text(config, TITLE);
    const size = count(config, SIZE, options.size);
    const color = text(config, COLOR, options.color) || options.color;
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
          aria-label={options.label}
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
              fontWeight:
                options.weight ?? `var(--mantine-h${options.order}-font-weight)`,
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
        style={{ cursor: "pointer" }}
      >
        {title || options.placeholder}
      </Title>
    );
  };

/** A title's widget, from what distinguishes it from the other. */
export const createWidgetTitle = (options: TitleOptions): AccessWidget => ({
  type: options.type,
  // Titles are widgets shared by all modes.
  kind: "common",
  label: options.label,
  icon: options.icon,
  // A new title is empty: it is named by double-clicking it, where it
  // stands, rather than in a drawer that would open right away.
  defaultConfig: { [TITLE]: "" },
  inlineEdit: true,
  ownClicks: true,

  Display: display(options),

  margins: (previousType) => ({
    top:
      previousType === null
        ? 0
        : typeof options.highMargin === "function"
          ? options.highMargin(previousType)
          : (options.highMargin ?? 0),
    bottom: options.lowMargin,
  }),

  appearance: (config, onChange) => [textLine(config, onChange, options)],

  Config: ({ config, onChange }) => (
    <Stack gap="xl">
      <TextInput
        label="Titre"
        placeholder={options.placeholder}
        value={text(config, TITLE)}
        onChange={(e) => onChange(withField(config, TITLE, e.currentTarget.value))}
        autoFocus
      />
    </Stack>
  ),
});
