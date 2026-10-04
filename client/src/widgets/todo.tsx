import { ActionIcon, Box, Checkbox, Group, Progress, Stack, Text, TextInput } from "@mantine/core";
import { IconListCheck, IconPlus, IconX } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import classes from "../assets/styles/AccessNumber.module.css";
import { withField } from "./types";
import type { AccessWidget, WidgetConfigProps, WidgetDisplayProps } from "./types";

// A to-do list: items you check off, right in the column. An item is added
// through the bottom field, checked with a click, renamed with a double click
// and removed with its cross. Everything is stored in the widget's
// configuration: the list is the board's, the same for whoever views it.
// Locked category, it can be read but not modified.

const ITEMS = "items";
const HIDE_DONE = "hideDone";
const DONE_AT_BOTTOM = "doneAtBottom";
const PROGRESS = "progress";
const FRAMED = "framed";

interface Element {
  id: string;
  text: string;
  done: boolean;
}

const isChecked = (config: unknown, key: string, defaultValue: boolean): boolean => {
  const value = (config as Record<string, unknown> | null)?.[key];
  return value === undefined ? defaultValue : Boolean(value);
};

/** The stored items, without whatever does not have the right shape. */
const itemsOf = (config: unknown): Element[] => {
  const value = (config as Record<string, unknown> | null)?.[ITEMS];
  if (!Array.isArray(value)) return [];
  return value.flatMap((e: unknown) => {
    const o = e as Partial<Element> | null;
    if (!o || typeof o.text !== "string") return [];
    return [{ id: typeof o.id === "string" ? o.id : crypto.randomUUID(), text: o.text, done: Boolean(o.done) }];
  });
};

const newId = () => crypto.randomUUID();

function Row({
  element,
  locked,
  onToggle,
  onRename,
  onRemove,
}: {
  element: Element;
  locked: boolean;
  onToggle: () => void;
  onRename: (text: string) => void;
  onRemove: () => void;
}) {
  const [editMode, setEditing] = useState(false);
  const [draft, setDraft] = useState(element.text);
  const [hover, setHovering] = useState(false);

  const close = () => {
    setEditing(false);
    const text = draft.trim();
    if (text && text !== element.text) onRename(text);
  };

  return (
    <Group
      gap="xs"
      wrap="nowrap"
      align="flex-start"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <Checkbox
        checked={element.done}
        onChange={onToggle}
        disabled={locked}
        color="teal"
        size="xs"
        mt={3}
        aria-label={element.text}
      />
      {editMode ? (
        <TextInput
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onBlur={close}
          onKeyDown={(e) => {
            if (e.key === "Enter") close();
            if (e.key === "Escape") setEditing(false);
          }}
          autoFocus
          variant="unstyled"
          size="xs"
          style={{ flex: 1 }}
          styles={{ input: { fontSize: "var(--mantine-font-size-sm)", height: "auto", minHeight: 0, lineHeight: 1.3 } }}
        />
      ) : (
        <Text
          size="sm"
          lh={1.3}
          style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere", cursor: locked ? undefined : "pointer" }}
          td={element.done ? "line-through" : undefined}
          c={element.done ? "dimmed" : undefined}
          // A click on the text checks it, as a label would; a double click
          // renames.
          onClick={() => !locked && onToggle()}
          onDoubleClick={() => {
            if (locked) return;
            setDraft(element.text);
            setEditing(true);
          }}
        >
          {element.text}
        </Text>
      )}
      {!locked && !editMode && (
        <ActionIcon
          variant="subtle"
          color="gray"
          size="xs"
          onClick={onRemove}
          aria-label="Retirer"
          style={{ visibility: hover ? "visible" : "hidden" }}
        >
          <IconX size={12} />
        </ActionIcon>
      )}
    </Group>
  );
}

function TodoList({ config, onChange, locked }: WidgetDisplayProps) {
  // Items change on screen immediately, without waiting for the server to
  // have stored the configuration; what it returns then replaces them.
  const [items, setItems] = useState(() => itemsOf(config));
  const [input, setInput] = useState("");
  const serialized = JSON.stringify((config as Record<string, unknown> | null)?.[ITEMS] ?? []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setItems(itemsOf(config)), [serialized]);

  const store = (nextItems: Element[]) => {
    setItems(nextItems);
    void onChange(withField(config, ITEMS, nextItems));
  };

  const add = () => {
    const text = input.trim();
    if (!text) return;
    store([...items, { id: newId(), text, done: false }]);
    setInput("");
  };

  const hide = isChecked(config, HIDE_DONE, false);
  const atBottom = isChecked(config, DONE_AT_BOTTOM, true);
  const done = items.filter((e) => e.done).length;
  const visibleItems = items
    .filter((e) => !(hide && e.done))
    .sort((a, b) => (atBottom ? Number(a.done) - Number(b.done) : 0));

  // Checking, typing or selecting a word does not drag the widget.
  const content = (
    <Stack gap={6} data-no-widget-drag>
      {isChecked(config, PROGRESS, false) && items.length > 0 && (
        <Group gap="xs" wrap="nowrap">
          <Progress value={(done / items.length) * 100} color="teal" size="sm" style={{ flex: 1 }} />
          <Text size="xs" c="dimmed" style={{ fontVariantNumeric: "tabular-nums" }}>
            {done}/{items.length}
          </Text>
        </Group>
      )}
      {visibleItems.map((e) => (
        <Row
          key={e.id}
          element={e}
          locked={locked}
          onToggle={() => store(items.map((x) => (x.id === e.id ? { ...x, done: !x.done } : x)))}
          onRename={(text) => store(items.map((x) => (x.id === e.id ? { ...x, text } : x)))}
          onRemove={() => store(items.filter((x) => x.id !== e.id))}
        />
      ))}
      {items.length === 0 && locked && (
        <Text size="sm" c="dimmed">
          Rien à faire
        </Text>
      )}
      {hide && done > 0 && (
        <Text size="xs" c="dimmed">
          {done} élément{done > 1 ? "s" : ""} fait{done > 1 ? "s" : ""} masqué{done > 1 ? "s" : ""}
        </Text>
      )}
      {!locked && (
        <TextInput
          placeholder="Ajouter un élément"
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          size="xs"
          variant="unstyled"
          leftSection={<IconPlus size={14} />}
          leftSectionWidth={22}
          styles={{ input: { fontSize: "var(--mantine-font-size-sm)" } }}
        />
      )}
    </Stack>
  );

  if (!isChecked(config, FRAMED, false)) return content;
  return (
    <Box className={classes.inset} style={{ border: "none" }}>
      {content}
    </Box>
  );
}

function Fields({ config, onChange }: WidgetConfigProps) {
  const items = itemsOf(config);
  const done = items.filter((e) => e.done).length;
  return (
    <Stack gap="sm">
      <Checkbox
        label="Placer les éléments faits en bas de la liste"
        checked={isChecked(config, DONE_AT_BOTTOM, true)}
        onChange={(e) => onChange(withField(config, DONE_AT_BOTTOM, e.currentTarget.checked))}
        color="teal"
      />
      <Checkbox
        label="Masquer les éléments faits"
        checked={isChecked(config, HIDE_DONE, false)}
        onChange={(e) => onChange(withField(config, HIDE_DONE, e.currentTarget.checked))}
        color="teal"
      />
      <Checkbox
        label="Afficher la progression"
        checked={isChecked(config, PROGRESS, false)}
        onChange={(e) => onChange(withField(config, PROGRESS, e.currentTarget.checked))}
        color="teal"
      />
      {done > 0 && (
        <Text
          size="sm"
          c="red"
          style={{ cursor: "pointer", width: "fit-content" }}
          onClick={() => onChange(withField(config, ITEMS, items.filter((e) => !e.done)))}
        >
          Retirer les {done} élément{done > 1 ? "s" : ""} fait{done > 1 ? "s" : ""}
        </Text>
      )}
    </Stack>
  );
}

export const todoWidget: AccessWidget = {
  type: "todo",
  kind: "common",
  label: "À faire",
  icon: IconListCheck,
  defaultConfig: { [ITEMS]: [], [DONE_AT_BOTTOM]: true, [HIDE_DONE]: false, [PROGRESS]: false },
  // Items are checked, renamed and removed right in the column.
  ownClicks: true,

  Display: TodoList,

  margins: () => ({ top: 0, bottom: 15 }),

  // It draws its own frame, set in the drawer's "Apparence" block.
  ownFrame: true,

  Config: Fields,

};
