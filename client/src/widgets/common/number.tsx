import { Input, Text, TextInput } from "@mantine/core";
import { IconArrowDown, IconArrowUp, IconHash, IconTrash } from "@tabler/icons-react";
import { Fragment, useRef, useState } from "react";
import classes from "../../assets/styles/AccessNumber.module.css";
import ListItems from "../../components/ui/ListItems";
import { DragHandle, InsertLine, useDraggableStack } from "../../components/ui/DraggableStack";
import { STRONG_TEXT } from "../../themes/colors";
import { SUBCATEGORY_COLOR, SUBCATEGORY_GAP } from "./subcategory";
import { isFramed, text } from "../types";
import type { AccessWidget, WidgetConfigProps } from "../types";
import type { AccessBlockType } from "@milo/shared";
import type { KeyboardEvent } from "react";

// Numbers: references that people come to read — a phone line, a contract,
// an extension. Each row carries a label, which says which one, and the
// number, which stands out on the right. They all fit in a single inset, on
// two columns.

const ROWS = "lines";

interface Row {
  label: string;
  number: string;
}

const EMPTY_ROW: Row = { label: "", number: "" };

// Beyond ten rows, the list scrolls.
const VISIBLE_ROWS = 10;

// Height of a field in its row: the text's, like renaming a category
// (LookupManager). An "sm" field is 36 px, more than the row.
const FIELD_HEIGHT = 22;
const INLINE_FIELD = {
  input: { height: FIELD_HEIGHT, minHeight: FIELD_HEIGHT, lineHeight: `${FIELD_HEIGHT}px` },
};

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

/** The rows only. */
const store = (list: Row[]): Record<string, unknown> => ({ [ROWS]: list });

/** The elements that already carry their own space, above and below them. */
const TITLES: AccessBlockType[] = ["category", "subcategory"];

/**
 * The space around the inset: that of a subcategory, at the top as at the
 * bottom. Nothing at the head or end of a column. Nothing either against a
 * title, which already leaves its own — the two would add up, the column being
 * a flex one, where margins do not collapse. And between two insets, only the
 * first sets it, for the same reason.
 */
const highMargin = (previous: AccessBlockType | null): number =>
  previous === null || previous === "number" || TITLES.includes(previous)
    ? 0
    : SUBCATEGORY_GAP;
const lowMargin = (next: AccessBlockType | null): number =>
  next === null || TITLES.includes(next) ? 0 : SUBCATEGORY_GAP;

/**
 * The rows, in the list of categories and labels (ListItems): each row is
 * edited in place, dragged by its handle or moved one step by right click,
 * which also deletes it; the last one adds another. Beyond ten, the list
 * scrolls. Everything stays in the drawer's draft until saved.
 */
function Rows({ config, onChange }: WidgetConfigProps) {
  const list = rows(config);
  const [newRow, setNewRow] = useState<Row>(EMPTY_ROW);
  const firstField = useRef<HTMLInputElement | null>(null);

  const change = (index: number, field: keyof Row, value: string) =>
    onChange(store(list.map((l, i) => (i === index ? { ...l, [field]: value } : l))));

  // Rows have no identifier: their rank stands in for it, for the duration
  // of the gesture. The order received is that of the old ranks.
  const handleReorder = (order: number[]) => onChange(store(order.flatMap((i) => list[i] ?? [])));
  const { zoneRef, drag, onPointerDown } = useDraggableStack({
    ids: list.map((_, i) => i),
    selector: "[data-attribute-row]",
    onReorder: handleReorder,
  });

  // One step up or down, from the row's menu.
  const move = (index: number, to: number) => {
    const order = list.map((_, i) => i).filter((i) => i !== index);
    order.splice(to, 0, index);
    handleReorder(order);
  };

  // Focus returns to the label: the next entry follows on.
  const add = () => {
    const row = { label: newRow.label.trim(), number: newRow.number.trim() };
    if (!row.label && !row.number) return;
    onChange(store([...list, row]));
    setNewRow(EMPTY_ROW);
    firstField.current?.focus();
  };

  // Enter adds from either field of the add row.
  const addKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
    if (e.key === "Escape") setNewRow(EMPTY_ROW);
  };

  return (
    <Input.Wrapper label="Attributs">
      <ListItems
        isEmpty={list.length === 0}
        emptyIcon={IconHash}
        emptyText="Aucun attribut"
        maxRows={VISIBLE_ROWS}
        add={{
          // The label slides in before the number field, which carries the
          // list's Enter symbol at its end.
          section: (
            <TextInput
              ref={firstField}
              placeholder="Libellé"
              aria-label="Libellé"
              value={newRow.label}
              onChange={(e) => setNewRow({ ...newRow, label: e.currentTarget.value })}
              onKeyDown={addKeyDown}
              variant="unstyled"
              size="sm"
              style={{ flex: 1, minWidth: 0 }}
              autoFocus
            />
          ),
          // Text and not a number: a number is copied as it is written, with
          // its spaces, dots and any country code.
          placeholder: "Numéro",
          value: newRow.number,
          onChange: (number) => setNewRow({ ...newRow, number }),
          onSubmit: add,
          onCancel: () => setNewRow(EMPTY_ROW),
        }}
      >
        <div ref={zoneRef}>
          {list.map((l, i) => (
            <div key={i} data-attribute-row style={{ opacity: drag?.id === i ? 0.4 : 1 }}>
              {drag?.target === i && <InsertLine />}
              <ListItems.Row
                actions={[
                  ...(i > 0
                    ? [{ label: "Monter", icon: IconArrowUp, onClick: () => move(i, i - 1) }]
                    : []),
                  ...(i < list.length - 1
                    ? [{ label: "Descendre", icon: IconArrowDown, onClick: () => move(i, i + 1) }]
                    : []),
                  {
                    label: "Supprimer",
                    icon: IconTrash,
                    onClick: () => onChange(store(list.filter((_, j) => j !== i))),
                    danger: true,
                  },
                ]}
              >
                {(active) => (
                  <>
                    {/* Only the handle moves the row: the fields keep their clicks. */}
                    <DragHandle
                      onPointerDown={onPointerDown(i, i)}
                      visible={active}
                      label="Glisser pour réordonner"
                    />
                    <TextInput
                      placeholder="Libellé"
                      aria-label="Libellé"
                      value={l.label}
                      onChange={(e) => change(i, "label", e.currentTarget.value)}
                      variant="unstyled"
                      size="sm"
                      style={{ flex: 1, minWidth: 0 }}
                      styles={INLINE_FIELD}
                    />
                    <TextInput
                      placeholder="Numéro"
                      aria-label="Numéro"
                      value={l.number}
                      onChange={(e) => change(i, "number", e.currentTarget.value)}
                      variant="unstyled"
                      size="sm"
                      style={{ flex: 1, minWidth: 0 }}
                      styles={INLINE_FIELD}
                    />
                  </>
                )}
              </ListItems.Row>
            </div>
          ))}
          {drag && drag.target >= list.length && <InsertLine />}
        </div>
      </ListItems>
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
    return (
      <div
        className={isFramed(config, true) ? classes.inset : undefined}
        style={{ border: "none" }}
      >
        {list.length === 0 ? (
          <Text size="sm" c={SUBCATEGORY_COLOR}>
            Attributs
          </Text>
        ) : (
          <div className={classes.grid}>
            {list.map((l, i) => (
              <Fragment key={i}>
                <Text size="sm" c={SUBCATEGORY_COLOR} truncate>
                  {l.label || "Numéro"}
                </Text>
                {/* White on the dark theme; on the light one, whose inset is
                    pale gray, white would not be legible: near-black. */}
                <Text size="sm" fw={600} c={STRONG_TEXT} className={classes.number}>
                  {l.number || "—"}
                </Text>
              </Fragment>
            ))}
          </div>
        )}
      </div>
    );
  },

  Config: Rows,

  margins: (previousType, nextType) => ({
    top: highMargin(previousType),
    bottom: lowMargin(nextType),
  }),
};
