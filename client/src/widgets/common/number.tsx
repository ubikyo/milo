import { Group, Input, Stack, Text, TextInput } from "@mantine/core";
import { IconHash } from "@tabler/icons-react";
import { Fragment, useState } from "react";
import type { DragEvent } from "react";
import classes from "../../assets/styles/AccessNumber.module.css";
import {
  EmptyList,
  Handle,
  ListFooter,
  NAME_INSET,
  ROUNDING,
  RowCheckbox,
  move,
  nameFieldStyle,
  rowStyle,
  useRowSelection,
  editKeys,
} from "../../components/ui/DrawerRows";
import { STRONG_TEXT } from "../../themes/colors";
import { insertRow, type SettingRow } from "../../components/ui/SettingRows";
import { H2_COLOR, H2_GAP } from "./h2";
import { Frame } from "../margins";
import { formatOf, formatReset, formatRow, formatStyle, NO_FORMAT } from "../text-format";
import type { TextFormat } from "../text-format";
import { isFramed, text, withField } from "../types";
import type { AccessWidget, WidgetConfigProps } from "../types";
import type { AccessBlockType } from "@milo/shared";

// Numbers: references that people come to read — a phone line, a contract,
// an extension. Each row carries a label, which says which one, and the
// number, which stands out on the right. They all fit in a single inset, on
// two columns.

const ROWS = "lines";

interface Row {
  label: string;
  number: string;
}

/**
 * The element's rows; a damaged row fills in what it lacks. An element stored
 * before multiple rows received its own at migration
 * (migrateWidgetConfig).
 */
const rows = (config: unknown): Row[] => {
  const raw = (config as Record<string, unknown> | null)?.[ROWS];
  return Array.isArray(raw)
    ? raw.map((l) => ({ label: text(l, "label"), number: text(l, "number") }))
    : [];
};

const LABEL_COLOR = "labelColor";
const VALUE_COLOR = "valueColor";

/** The formats' prefixes: "labelBold", "valueItalic"… */
const LABEL = "label";
const VALUE = "value";

/** Where each column's texts sit: by default, the attribute left, the value right. */
const LABEL_ALIGN = "labelAlign";
const VALUE_ALIGN = "valueAlign";

const ALIGNMENTS = [
  { value: "left", label: "Gauche" },
  { value: "center", label: "Centre" },
  { value: "right", label: "Droite" },
] as const;

type Alignment = (typeof ALIGNMENTS)[number]["value"];

const alignmentOf = (config: unknown, key: string, defaultValue: Alignment): Alignment =>
  ALIGNMENTS.find((a) => a.value === text(config, key))?.value ?? defaultValue;

/** The value stands out, in bold at the weight below; the attribute does not. */
const VALUE_FORMAT: TextFormat = { bold: true, italic: false, underline: false };
const BOLD_WEIGHT = 600;

/** The rows, the other settings kept — the colors, the frame. */
const store = (config: unknown, list: Row[]): Record<string, unknown> => withField(config, ROWS, list);

/** The elements that already carry their own space, above and below them. */
const TITLES: AccessBlockType[] = ["category"];

/**
 * The space around the inset: that of an "H2" title, at the top as at the
 * bottom. Nothing at the head or end of a column. Nothing either against a
 * title, which already leaves its own — the two would add up, the column being
 * a flex one, where margins do not collapse. And between two insets, only the
 * first sets it, for the same reason.
 */
const highMargin = (previous: AccessBlockType | null): number =>
  previous === null || previous === "number" || TITLES.includes(previous)
    ? 0
    : H2_GAP;
const lowMargin = (next: AccessBlockType | null): number =>
  next === null || TITLES.includes(next) ? 0 : H2_GAP;

interface AttributeRowProps {
  row: Row;
  rank: number;
  total: number;
  held: boolean;
  /** Just added: its attribute takes focus. */
  toFill: boolean;
  onChange: (field: keyof Row, value: string) => void;
  /** The row left, focus gone from both its fields. */
  onLeave: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent<HTMLElement>) => void;
  checked: boolean;
  onCheck: (checked: boolean) => void;
}

/** A row in the drawer: its handle, its box, its attribute and its value, edited in place. */
function AttributeRow({
  row,
  rank,
  total,
  held,
  toFill,
  onChange,
  onLeave,
  onDragStart,
  onDragEnd,
  onDragOver,
  checked,
  onCheck,
}: AttributeRowProps) {
  const [entered, setEntered] = useState<keyof Row | null>(null);
  const field = (name: keyof Row, placeholder: string) => (
    <TextInput
      size="sm"
      radius={ROUNDING}
      style={{ flex: 1, minWidth: 0, marginLeft: name === "label" ? -NAME_INSET : 0 }}
      styles={{ input: nameFieldStyle(entered === name) }}
      placeholder={placeholder}
      aria-label={placeholder}
      value={row[name]}
      onChange={(e) => onChange(name, e.currentTarget.value)}
      autoFocus={toFill && name === "label"}
      onFocus={() => setEntered(name)}
      onBlur={() => setEntered(null)}
      // Enter validates, Escape puts back what the field held.
      {...editKeys((value) => onChange(name, value))}
    />
  );
  return (
    <Group
      gap="sm"
      wrap="nowrap"
      onDragOver={onDragOver}
      onDrop={(e) => e.preventDefault()}
      // Going from the attribute to the value does not leave the row.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onLeave();
      }}
      style={rowStyle(rank, total, held)}
    >
      <Handle
        label={`Déplacer ${row.label || row.number || "l'attribut"}`}
        active={Boolean(row.label.trim() || row.number.trim())}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />
      <RowCheckbox
        label={`Sélectionner ${row.label || row.number || "l'attribut"}`}
        checked={checked}
        onChange={onCheck}
        afterHandle
      />
      {field("label", "Attribut")}
      {/* Text and not a number: a value is copied as it is written, with
          its spaces, dots and any country code. */}
      {field("number", "Valeur")}
    </Group>
  );
}

/**
 * The rows: the handle orders them, their boxes select those that the button
 * in place of "Ajouter" removes together, "Ajouter" puts an empty one at the
 * end, which clears itself if left without anything written in it. Everything
 * stays in the drawer's draft until saved.
 */
function Rows({ config, onChange }: WidgetConfigProps) {
  const list = rows(config);
  /** The rank of the row being dragged. */
  const [held, setHeld] = useState<number | null>(null);
  /** The row just added: its attribute takes focus. */
  const [toFill, setToFill] = useState<number | null>(null);
  /** The checked rows, by rank. */
  const selection = useRowSelection(list.map((_, rank) => rank));

  const save = (next: Row[]) => onChange(store(config, next));
  // Rows are known by their rank: those after the removed one move up, their
  // checks with them.
  const remove = (rank: number) => {
    save(list.filter((_, i) => i !== rank));
    selection.reset(selection.checked.filter((i) => i !== rank).map((i) => (i > rank ? i - 1 : i)));
  };
  const removeChecked = () => {
    save(list.filter((_, i) => !selection.isChecked(i)));
    selection.reset();
  };

  const add = () => {
    save([...list, { label: "", number: "" }]);
    setToFill(list.length);
  };

  // The held row takes the place of the one it hovers.
  const dragHover = (e: DragEvent<HTMLElement>, rank: number) => {
    if (held === null) return;
    e.preventDefault();
    const next = move(list, held, rank);
    if (!next) return;
    setHeld(rank);
    save(next);
    // The checks follow their rows.
    const checks = move(
      list.map((_, i) => selection.isChecked(i)),
      held,
      rank,
    )!;
    selection.reset(checks.flatMap((on, i) => (on ? [i] : [])));
  };

  return (
    <Input.Wrapper label="Attributs">
      {list.length === 0 ? (
        <EmptyList icon={IconHash} message="Aucun attribut" />
      ) : (
        <Stack gap={1}>
          {list.map((row, rank) => (
            <AttributeRow
              key={rank}
              row={row}
              rank={rank}
              total={list.length}
              held={held === rank}
              toFill={toFill === rank}
              onChange={(field, value) =>
                save(list.map((l, i) => (i === rank ? { ...l, [field]: value } : l)))
              }
              onLeave={() => {
                setToFill(null);
                // A row left without anything written in it clears itself.
                if (!row.label.trim() && !row.number.trim()) remove(rank);
              }}
              onDragStart={() => setHeld(rank)}
              onDragEnd={() => setHeld(null)}
              onDragOver={(e) => dragHover(e, rank)}
              checked={selection.isChecked(rank)}
              onCheck={(on) => selection.toggle(rank, on)}
            />
          ))}
        </Stack>
      )}

      {/* As close as possible to the list it lengthens. */}
      <ListFooter
        addLabel="Ajouter un attribut"
        onAdd={add}
        checkedCount={selection.checked.length}
        onDeleteChecked={removeChecked}
      />
    </Input.Wrapper>
  );
}

export const numberWidget: AccessWidget = {
  type: "number",
  kind: "common",
  label: "Attributs",
  icon: IconHash,
  defaultConfig: { [ROWS]: [] },

  // Always framed so far: they stay so until their frame is removed, in the
  // drawer's "Apparence" block.
  ownFrame: true,
  defaultFrame: true,

  Display: ({ config }) => {
    const list = rows(config);
    const labelStyle = formatStyle(formatOf(config, NO_FORMAT, LABEL), BOLD_WEIGHT);
    const valueStyle = formatStyle(formatOf(config, VALUE_FORMAT, VALUE), BOLD_WEIGHT);
    const labelAlign = alignmentOf(config, LABEL_ALIGN, "left");
    const valueAlign = alignmentOf(config, VALUE_ALIGN, "right");
    return (
      <Frame config={config} framed={isFramed(config, true)}>
        {list.length === 0 ? (
          <Text size="sm" c={H2_COLOR}>
            Attributs
          </Text>
        ) : (
          <div className={classes.grid}>
            {list.map((l, i) => (
              <Fragment key={i}>
                <Text size="sm" c={text(config, LABEL_COLOR) || H2_COLOR} style={{ ...labelStyle, textAlign: labelAlign }} truncate>
                  {l.label || "Attribut"}
                </Text>
                {/* White on the dark theme; on the light one, whose inset is
                    pale gray, white would not be legible: near-black. */}
                <Text size="sm" c={text(config, VALUE_COLOR) || STRONG_TEXT} style={{ ...valueStyle, textAlign: valueAlign }} className={classes.number}>
                  {l.number || "—"}
                </Text>
              </Fragment>
            ))}
          </div>
        )}
      </Frame>
    );
  },

  // Each field shows its default, in hexadecimal: the "H2" title's light
  // gray for the attribute, black or white for the value, depending on the
  // scheme. Brought back to it, a color is no longer stored: the display keeps
  // following the scheme. The format sits beside the color, on the same row:
  // its button resets both.
  appearance: (config, onChange) => {
    const dark = document.documentElement.getAttribute("data-mantine-color-scheme") === "dark";
    const textRow = (
      name: string,
      what: string,
      key: string,
      defaultColor: string,
      prefix: string,
      defaultFormat: TextFormat,
    ): SettingRow => {
      const color = text(config, key);
      const format = formatRow(config, onChange, defaultFormat, prefix);
      return {
        name,
        what,
        color: {
          value: color || defaultColor,
          onChange: (v) => onChange(insertRow(config, { [key]: v === defaultColor ? "" : v })),
        },
        formats: format.formats,
        modified: (color !== "" && color !== defaultColor) || format.modified,
        reset: () => onChange(insertRow(config, { [key]: "", ...formatReset(prefix) })),
      };
    };
    // Each column's alignment, brought back to its own, is no longer stored.
    const alignRow = (name: string, what: string, key: string, defaultValue: Alignment): SettingRow => {
      const current = alignmentOf(config, key, defaultValue);
      return {
        name,
        what,
        choice: {
          value: current,
          data: ALIGNMENTS.map(({ value, label }) => ({ value, label })),
          onChange: (v) => onChange(insertRow(config, { [key]: v === defaultValue ? "" : v })),
        },
        modified: current !== defaultValue,
        reset: () => onChange(insertRow(config, { [key]: "" })),
      };
    };
    return [
      textRow("Attribut", "des attributs", LABEL_COLOR, "#dcdcdc", LABEL, NO_FORMAT),
      textRow("Valeur", "des valeurs", VALUE_COLOR, dark ? "#ffffff" : "#000000", VALUE, VALUE_FORMAT),
      alignRow("Attribut", "de l'alignement des attributs", LABEL_ALIGN, "left"),
      alignRow("Valeur", "de l'alignement des valeurs", VALUE_ALIGN, "right"),
    ];
  },

  Config: Rows,

  margins: (previousType, nextType) => ({
    top: highMargin(previousType),
    bottom: lowMargin(nextType),
  }),
};
