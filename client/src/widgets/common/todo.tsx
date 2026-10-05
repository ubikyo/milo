import { ActionIcon, Checkbox, Group, Portal, Progress, Select, Stack, Switch, Text, TextInput } from "@mantine/core";
import { IconListCheck, IconTrash } from "@tabler/icons-react";
import { Fragment, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import AddButton from "../../components/ui/AddButton";
import CelebrationEffect, { MARKS } from "../../components/ui/CelebrationEffect";
import type { Effect, Zone } from "../../components/ui/CelebrationEffect";
import { DragHandle, InsertLine, useDraggableStack } from "../../components/ui/DraggableStack";
import { RED } from "../../themes/colors";
import { Frame } from "../margins";
import { text, withField } from "../types";
import type { AccessWidget, WidgetConfigProps, WidgetDisplayProps } from "../types";

// A to-do list: items you check off, right in the column. An item is added
// with "Ajouter un élément" at the bottom, checked with a click, renamed with a
// double click, moved with its handle and removed with its trash. Everything is stored in the widget's
// configuration: the list is the board's, the same for whoever views it.
// Checking an item, and checking the last one, can each play one of the task
// lists' arrival animations.
// The list is used outside edit mode too; only an account that cannot modify
// the widget's category sees it read-only.

const ITEMS = "items";
const HIDE_DONE = "hideDone";
const DONE_AT_BOTTOM = "doneAtBottom";
const PROGRESS = "progress";
const FRAMED = "framed";
const ANIMATION = "animation";
const FINISH_ANIMATION = "finishAnimation";

/** The animation choices: none, or one of the task lists' celebrations. */
const ANIMATIONS = [{ value: "none", label: "Aucune" }, ...MARKS.map((m) => ({ value: m.effect, label: m.label }))];

/** An animation's emoji, before its name in the select. */
const emojiOf = (effect: string) => MARKS.find((m) => m.effect === effect)?.emoji;

/** The space between the emoji and the name. */
const EMOJI_GAP = 10;
/** The emoji's box, and the field's padding on its left. */
const EMOJI_WIDTH = 18;
const EMOJI_INSET = 12;

/** The configured animation, when it is one of the celebrations. */
const effectOf = (config: unknown, key: string): Effect | null => {
  const value = text(config, key, "none");
  return MARKS.find((m) => m.effect === value)?.effect ?? null;
};

/** A celebration in progress, played on the list and the item just checked. */
interface Celebration {
  key: number;
  effect: Effect;
  column: Zone;
  card: Zone | null;
}

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

/**
 * An item's field, rename or addition, laid exactly over its text: same size
 * and line height, and without the transparent border Mantine keeps on an
 * unstyled field, which would make the row grow.
 */
const INLINE_INPUT = {
  input: { fontSize: "var(--mantine-font-size-sm)", height: "auto", minHeight: 0, lineHeight: 1.3, border: 0 },
};

/** The gap between two items. */
const ITEM_GAP = 6;
/** How long a click on the text waits, in case it is the first of a double click. */
const DOUBLE_CLICK_DELAY = 250;

function Row({
  element,
  locked,
  movable,
  dragged,
  onToggle,
  onRename,
  onRemove,
  onPointerDown,
}: {
  element: Element;
  locked: boolean;
  /** False for a done item while those go to the bottom: it has no handle. */
  movable: boolean;
  dragged: boolean;
  onToggle: () => void;
  onRename: (text: string) => void;
  onRemove: () => void;
  onPointerDown: (event: ReactPointerEvent) => void;
}) {
  const [editMode, setEditing] = useState(false);
  const [draft, setDraft] = useState(element.text);
  const [hover, setHovering] = useState(false);
  // A click on the text checks the item only once it is clear no second click
  // follows: a double click renames without checking and unchecking it.
  const clickTimer = useRef<number | null>(null);
  const cancelClick = () => {
    if (clickTimer.current !== null) window.clearTimeout(clickTimer.current);
    clickTimer.current = null;
  };
  useEffect(() => cancelClick, []);

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
      data-todo-item={element.id}
      data-todo-movable={movable || undefined}
      style={dragged ? { opacity: 0.4 } : undefined}
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
          styles={INLINE_INPUT}
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
          onClick={(e) => {
            if (locked || e.detail > 1) return;
            cancelClick();
            clickTimer.current = window.setTimeout(() => {
              clickTimer.current = null;
              onToggle();
            }, DOUBLE_CLICK_DELAY);
          }}
          onDoubleClick={() => {
            if (locked) return;
            cancelClick();
            setDraft(element.text);
            setEditing(true);
          }}
        >
          {element.text}
        </Text>
      )}
      {!locked && !editMode && (
        // The handle and the trash only appear on hover, but keep their place:
        // the text does not reflow when the mouse crosses the row.
        <Group
          gap={2}
          wrap="nowrap"
          mt={1}
          style={{ flexShrink: 0, visibility: hover || dragged ? "visible" : "hidden" }}
        >
          {/* Without a handle, its place stays: the trashes remain aligned. */}
          <span style={{ display: "inline-flex", visibility: movable ? undefined : "hidden" }}>
            <DragHandle onPointerDown={onPointerDown} label={`Déplacer ${element.text}`} />
          </span>
          <ActionIcon
            variant="subtle"
            color={RED}
            size="xs"
            onClick={onRemove}
            aria-label={`Supprimer ${element.text}`}
          >
            <IconTrash size={14} />
          </ActionIcon>
        </Group>
      )}
    </Group>
  );
}

function TodoList({ config, onChange, locked }: WidgetDisplayProps) {
  // Items change on screen immediately, without waiting for the server to
  // have stored the configuration; what it returns then replaces them.
  const [items, setItems] = useState(() => itemsOf(config));
  // The field of the item being added, open from "Ajouter un élément"; null
  // while closed.
  const [input, setInput] = useState<string | null>(null);
  const serialized = JSON.stringify((config as Record<string, unknown> | null)?.[ITEMS] ?? []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setItems(itemsOf(config)), [serialized]);

  // The animation played when an item is checked — or, when it was the last
  // one, that of the end, if one is chosen. The list and the item are measured
  // once the item has been painted at its new place (at the bottom, if the
  // done ones go there).
  const listRef = useRef<HTMLDivElement | null>(null);
  const [celebrations, setCelebrations] = useState<Celebration[]>([]);
  const celebrate = (id: string, last: boolean) => {
    const effect = (last && effectOf(config, FINISH_ANIMATION)) || effectOf(config, ANIMATION);
    if (!effect) return;
    const zone = (el: HTMLElement | null | undefined): Zone | null => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    };
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const column = zone(listRef.current);
        if (!column) return;
        const card = zone(listRef.current?.querySelector<HTMLElement>(`[data-todo-item="${id}"]`));
        setCelebrations((before) => [...before, { key: Date.now(), effect, column, card }]);
      }),
    );
  };

  const store = (nextItems: Element[]) => {
    setItems(nextItems);
    void onChange(withField(config, ITEMS, nextItems));
  };

  /** Adds what was typed; the field stays open for the next one unless "close". */
  const add = (close: boolean) => {
    const text = input?.trim();
    if (text) store([...items, { id: newId(), text, done: false }]);
    setInput(close ? null : "");
  };

  const hide = isChecked(config, HIDE_DONE, false);
  const atBottom = isChecked(config, DONE_AT_BOTTOM, true);
  const done = items.filter((e) => e.done).length;
  const visibleItems = items
    .filter((e) => !(hide && e.done))
    .sort((a, b) => (atBottom ? Number(a.done) - Number(b.done) : 0));

  // Items are dragged among those shown, by their rank — the stack works
  // with numeric ids; the hidden ones — done, when they are masked — follow at
  // the end. When the done ones go to the bottom, they stay there: only the
  // others move, among themselves — the first ranks of the list.
  const movable = atBottom ? visibleItems.filter((e) => !e.done) : visibleItems;
  const { zoneRef, drag, onPointerDown } = useDraggableStack({
    ids: movable.map((_, rank) => rank),
    selector: "[data-todo-movable]",
    onReorder: (order) => {
      const moved = order.flatMap((rank) => movable[rank] ?? []);
      store([...moved, ...items.filter((e) => !moved.includes(e))]);
    },
  });

  // Checking, typing or selecting a word does not drag the widget.
  const content = (
    <Stack
      gap={ITEM_GAP}
      data-no-widget-drag
      ref={(el) => {
        listRef.current = el;
        zoneRef.current = el;
      }}
    >
      {isChecked(config, PROGRESS, false) && items.length > 0 && (
        <Group gap="xs" wrap="nowrap">
          <Progress value={(done / items.length) * 100} color="teal" size="sm" style={{ flex: 1 }} />
          <Text size="xs" c="dimmed" style={{ fontVariantNumeric: "tabular-nums" }}>
            {done}/{items.length}
          </Text>
        </Group>
      )}
      {visibleItems.map((e, index) => (
        <Fragment key={e.id}>
          {drag?.target === index && <InsertLine gap={ITEM_GAP} atEdge={index === 0} />}
          <Row
            element={e}
            locked={locked}
            movable={index < movable.length}
            dragged={drag?.id === index}
            onPointerDown={onPointerDown(index, index)}
            onToggle={() => {
              const next = items.map((x) => (x.id === e.id ? { ...x, done: !x.done } : x));
              store(next);
              if (!e.done) celebrate(e.id, next.every((x) => x.done));
            }}
            onRename={(text) => store(items.map((x) => (x.id === e.id ? { ...x, text } : x)))}
            onRemove={() => store(items.filter((x) => x.id !== e.id))}
          />
        </Fragment>
      ))}
      {/* At the very end — unless done items follow: the line is then drawn
          before the first of them. */}
      {drag && drag.target >= visibleItems.length && <InsertLine gap={ITEM_GAP} />}
      {items.length === 0 && locked && (
        <Text size="sm" c="dimmed">
          Rien à faire
        </Text>
      )}
      {hide && done > 0 && (
        <Text size="xs" c="dimmed">
          {done} élément{done > 1 ? "s" : ""} fait{done > 1 ? "s" : ""} masqué
          {done > 1 ? "s" : ""}
        </Text>
      )}
      {!locked && input !== null && (
        // The new item's row, in edit mode: the same layout as the others.
        <Group gap="xs" wrap="nowrap" align="flex-start">
          <Checkbox checked={false} disabled color="teal" size="xs" mt={3} aria-hidden tabIndex={-1} />
          <TextInput
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            onBlur={() => add(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add(false);
              if (e.key === "Escape") setInput(null);
            }}
            autoFocus
            placeholder="Nouvel élément"
            variant="unstyled"
            size="xs"
            style={{ flex: 1 }}
            styles={INLINE_INPUT}
            aria-label="Nouvel élément"
          />
        </Group>
      )}
      {!locked && input === null && <AddButton label="Ajouter un élément" onClick={() => setInput("")} />}
    </Stack>
  );

  return (
    <Frame config={config} framed={isChecked(config, FRAMED, false)}>
      {content}
      {/* Over the whole screen: outside the widget, which could clip it. */}
      <Portal>
        {celebrations.map((c) => (
          <CelebrationEffect
            key={c.key}
            effect={c.effect}
            column={c.column}
            card={c.card}
            onDone={() => setCelebrations((before) => before.filter((f) => f.key !== c.key))}
          />
        ))}
      </Portal>
    </Frame>
  );
}

/** An animation's select: the emoji before the name, in the list as in the field. */
function AnimationSelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Select
      label={label}
      data={ANIMATIONS}
      value={value}
      onChange={(v) => v && onChange(v)}
      allowDeselect={false}
      w={200}
      renderOption={({ option }) => (
        <Group gap={EMOJI_GAP} wrap="nowrap">
          {emojiOf(option.value) && <span>{emojiOf(option.value)}</span>}
          <span>{option.label}</span>
        </Group>
      )}
      leftSection={emojiOf(value) && <span style={{ width: EMOJI_WIDTH }}>{emojiOf(value)}</span>}
      leftSectionWidth={emojiOf(value) ? EMOJI_INSET + EMOJI_WIDTH + EMOJI_GAP : undefined}
      styles={{
        section: { justifyContent: "flex-start", paddingLeft: EMOJI_INSET },
      }}
    />
  );
}

function Fields({ config, onChange }: WidgetConfigProps) {
  return (
    <Stack gap="xl">
      <Stack gap="sm">
        <Switch
          label="Placer les éléments faits en bas de la liste"
          checked={isChecked(config, DONE_AT_BOTTOM, true)}
          onChange={(e) => onChange(withField(config, DONE_AT_BOTTOM, e.currentTarget.checked))}
          color="teal"
        />
        <Switch
          label="Masquer les éléments faits"
          checked={isChecked(config, HIDE_DONE, false)}
          onChange={(e) => onChange(withField(config, HIDE_DONE, e.currentTarget.checked))}
          color="teal"
        />
        <Switch
          label="Afficher la progression"
          checked={isChecked(config, PROGRESS, false)}
          onChange={(e) => onChange(withField(config, PROGRESS, e.currentTarget.checked))}
          color="teal"
        />
      </Stack>
      <Group align="flex-start">
        <AnimationSelect
          label="Une case est cochée"
          value={text(config, ANIMATION, "none")}
          onChange={(v) => onChange(withField(config, ANIMATION, v))}
        />
        <AnimationSelect
          label="Ensemble coché"
          value={text(config, FINISH_ANIMATION, "none")}
          onChange={(v) => onChange(withField(config, FINISH_ANIMATION, v))}
        />
      </Group>
    </Stack>
  );
}

export const todoWidget: AccessWidget = {
  type: "todo",
  kind: "common",
  label: "À faire",
  icon: IconListCheck,
  defaultConfig: {
    [ITEMS]: [],
    [DONE_AT_BOTTOM]: true,
    [HIDE_DONE]: false,
    [PROGRESS]: false,
    [ANIMATION]: "none",
    [FINISH_ANIMATION]: "none",
  },
  // Items are checked, renamed and removed right in the column, edit mode
  // or not.
  ownClicks: true,
  liveContent: true,

  Display: TodoList,

  margins: () => ({ top: 0, bottom: 15 }),

  // It draws its own frame, set in the drawer's "Apparence" block.
  ownFrame: true,

  Config: Fields,
};
