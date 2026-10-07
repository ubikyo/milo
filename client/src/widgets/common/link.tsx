import { Anchor, Group, Input, Select, Stack, Text, TextInput } from "@mantine/core";
import { IconLink } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { linkEntries, withLinks } from "@milo/shared";
import type { LinkEntry, LinkOpening } from "@milo/shared";
import classes from "../../assets/styles/AccessLink.module.css";
import {
  EmptyList,
  Handle,
  ListFooter,
  NAME_INSET,
  ROUNDING,
  RowCheckbox,
  editKeys,
  move,
  nameFieldStyle,
  rowStyle,
  useRowSelection,
} from "../../components/ui/DrawerRows";
import { insertRow } from "../../components/ui/SettingRows";
import { formatOf, formatRow, formatStyle } from "../text-format";
import { count, text } from "../types";
import type { AccessWidget, WidgetConfigProps, WidgetDisplayProps } from "../types";
import { themeColor } from "../../lib/themeColors";

// Links: services' addresses, the words that designate them, and the means to
// switch them off without losing them. A widget holds as many as wanted, one
// per row, in the order its drawer sets (shared, link-widget.ts).
//
// A single click opens the address — in the page, or in another one, as the
// drawer says; a double click renames
// the link in place, like a column title — it is the label most often
// touched up, and the drawer no longer has to open for it. The rest — the
// address, the switch — is set in the drawer, which a right click opens.
//
// Both gestures share the same word, hence the delay below: the first click
// waits to know whether a second one follows. This is what a Task mode card
// already does.

const COLOR = "color";
const SIZE = "size";
/** Where each link opens, chosen on its row in the drawer. */
const OPENINGS: { value: LinkOpening; label: string }[] = [
  { value: "off", label: "Désactivée" },
  { value: "self", label: "Cette fenêtre" },
  { value: "blank", label: "Nouvelle fenêtre" },
];

/**
 * The drawer's width: the shared one (IndicatorDrawer, 560) and 150 more — its
 * rows carry a name, an address and an opening side by side.
 */
const DRAWER_WIDTH = 710;

/** The width of the opening choice, on a link's row. */
const OPENING_WIDTH = 150;

/**
 * The text size of a link that has been given none: Mantine's "sm", that of
 * the rest of the column. The bounds are those of the titles.
 */
const DEFAULT_SIZE = 14;
const SIZE_MIN = 8;
const SIZE_MAX = 64;

/** The color of a link that has been given none: the text's, depending on the theme. */
const DEFAULT_COLOR = "var(--milo-widget-text)";

/**
 * Delay left to a second click before the first opens the address. Short
 * enough that opening does not drag, long enough for an ordinary double click
 * — and well within the window during which the browser still treats the click
 * as a gesture by the person, without which it would block the opening.
 */
const DOUBLE_CLICK_DELAY = 250;

/**
 * The line height of a link row. Mantine's for an "sm" text is 1.55: the row
 * then becomes clearly taller than the word it carries, and two consecutive
 * links look spaced apart without any margin separating them. Tightened to
 * the value of the column's titles, the row is as tall as the link.
 *
 * Set as a style rather than through the "lh" prop: that one does not reach
 * the variable Mantine reads for a "Text" line height, and would have no
 * effect — like "fz" on a title.
 */
const LINE_SPACING = { lineHeight: 1.3 };

/**
 * One line, cut with an ellipsis when the column is too narrow. Not through
 * Mantine's "lineClamp": its "-webkit-box" lets a box sized to its word shrink
 * to the narrowest the word allows — "Prism…" for "Prism Central", with room
 * to spare. Kept on one line ("nowrap"), the text cannot get narrower than
 * itself: it is cut only by the width of the column ("max-width").
 */
const ONE_LINE = {
  ...LINE_SPACING,
  whiteSpace: "nowrap" as const,
  overflow: "hidden" as const,
  textOverflow: "ellipsis" as const,
};

/**
 * The anchor is a block — Mantine would set it back to "display: inline", and
 * the container's line height would then set its row's height, nearly 25
 * pixels for a 14-pixel word. It stops at the word: taking the whole column,
 * the hover would light up well beyond the text.
 */
const LINK_ROW = {
  ...ONE_LINE,
  display: "block" as const,
  width: "fit-content" as const,
  maxWidth: "100%" as const,
};

/** One link of the widget, on its row; "onRename" stores its new label. */
function LinkRow({
  entry,
  config,
  onRename,
  locked,
}: {
  entry: LinkEntry;
  config: unknown;
  onRename: (label: string) => void | Promise<void>;
  locked: boolean;
}) {
  const timer = useRef<number | null>(null);
  const field = useRef<HTMLInputElement | null>(null);
  const [editMode, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  // A link unmounted during the wait will open nothing.
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  // The field takes focus as soon as it appears, and the input is already
  // selected there: the double click means "I replace this label".
  useEffect(() => {
    if (!editMode) return;
    field.current?.focus();
    field.current?.select();
  }, [editMode]);

  const { url, label: title } = entry;
  const label = title || url;
  const active = entry.opening !== "off";
  const color = text(config, COLOR) || DEFAULT_COLOR;
  const size = count(config, SIZE, DEFAULT_SIZE);
  const format = formatStyle(formatOf(config));
  const newWindow = entry.opening === "blank";

  const click = () => {
    // The second click of a double click lands here: it triggers nothing, it
    // is "onDoubleClick" that will take over and cancel the wait.
    if (timer.current !== null) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      if (!url) return;
      if (newWindow) window.open(url, "_blank", "noopener,noreferrer");
      else window.location.assign(url);
    }, DOUBLE_CLICK_DELAY);
  };

  const doubleClick = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (locked) return;
    setDraft(title);
    setEditing(true);
  };

  // The label goes to the server when the input closes — it is the only
  // gesture it carries. Unchanged, nothing is sent. Cleared, the link goes
  // back to being read by its address.
  const close = async () => {
    setEditing(false);
    const newValue = draft.trim();
    if (newValue === title) return;
    await onRename(newValue);
  };

  if (editMode) {
    return (
      // The field takes exactly the place of the word it replaces: the size
      // and line height of the link row, without the border or the minimum
      // height Mantine gives an "unstyled" field — otherwise the column would
      // jump on double click.
      <TextInput
        ref={field}
        aria-label="Intitulé du lien"
        placeholder={url || "Lien"}
        value={draft}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={close}
        onKeyDown={(e) => {
          if (e.key === "Enter") close();
          // Escape gives up: the previous label stays.
          if (e.key === "Escape") setEditing(false);
        }}
        variant="unstyled"
        styles={{
          input: {
            ...LINE_SPACING,
            ...format,
            fontSize: size,
            color: color,
            height: "auto",
            minHeight: 0,
            border: "none",
          },
        }}
      />
    );
  }

  // Switched off, the link can still be read — struck through and grayed —
  // while the category is open: that is where it is switched back on. When
  // locked, it no longer appears at all (see LinkWidget).
  if (!active) {
    return (
      <Text
        style={{ ...ONE_LINE, ...format, fontSize: size, textDecoration: "line-through" }}
        c="dimmed"
        onDoubleClick={doubleClick}
      >
        {label || "Lien"}
      </Text>
    );
  }

  // Without an address, the link opens nothing, but it keeps the color of the
  // others: it has just been added and is only waiting to be filled in.
  if (!url) {
    return (
      <Text
        style={{ ...ONE_LINE, ...format, fontSize: size }}
        c={color}
        onDoubleClick={doubleClick}
      >
        {label || "Lien"}
      </Text>
    );
  }

  return (
    // The address opens in the page or alongside. "href" is kept for what the
    // right click and the keyboard do with it, but it is the handler that
    // opens: without it, a double click would open two pages.
    <Anchor
      href={url}
      target={newWindow ? "_blank" : undefined}
      rel={newWindow ? "noopener noreferrer" : undefined}
      style={{ ...LINK_ROW, ...format, fontSize: size }}
      // Neither blue nor underlined — unless the appearance asks for it: the
      // link reads like the rest of the column.
      // The color is set here rather than in a stylesheet — it then wins for
      // sure over Mantine's, whatever the order of the sheets. The padding and
      // the hover background, on the other hand, have no inline equivalent
      // (assets/styles/AccessLink.module.css).
      c={color}
      underline="never"
      className={classes.link}
      onClick={(e) => {
        e.preventDefault();
        click();
      }}
      onDoubleClick={doubleClick}
    >
      {label}
    </Anchor>
  );
}

function LinkWidget({ config, onChange, locked }: WidgetDisplayProps) {
  const links = linkEntries(config);
  // Emptied of all its links, the widget still holds its place, to be found
  // again in edit mode.
  if (links.length === 0) {
    return (
      <Text style={{ ...LINE_SPACING, fontSize: count(config, SIZE, DEFAULT_SIZE) }} c="dimmed">
        Aucun lien
      </Text>
    );
  }
  return (
    // The whole width of the column, its links placed in it as the drawer's
    // alignment says (widgets/alignment.ts) — "align-items" taken from the box
    // that holds it. Left to the width of its links, the box would come out a
    // few pixels short of them — they reach 3 pixels past it on each side
    // (AccessLink.module.css) — and cut their last letters.
    <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "inherit" }}>
      {links.map((entry, rank) =>
        // Switched off and locked, a link disappears: nobody needs to see it
        // anymore, and nobody can switch it back on anyway.
        locked && entry.opening === "off" ? null : (
        <LinkRow
          key={rank}
          entry={entry}
          config={config}
          locked={locked}
          onRename={(label) =>
            onChange(withLinks(config, links.map((l, i) => (i === rank ? { ...l, label } : l))))
          }
        />
        ),
      )}
    </div>
  );
}

/** A field of a link's row, edited in place: transparent until it has focus. */
function LinkField({
  value,
  onChange,
  placeholder,
  label,
  flex,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  flex: number;
  autoFocus?: boolean;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <TextInput
      size="sm"
      radius={ROUNDING}
      style={{ flex, minWidth: 0 }}
      styles={{ input: nameFieldStyle(focus) }}
      placeholder={placeholder}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      {...editKeys(onChange)}
      autoFocus={autoFocus}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
    />
  );
}

/**
 * The widget's links in its drawer: one row per link, its name then its
 * address. The handle reorders them, the box selects them for removal — the
 * checked ones go together, from the button that takes the place of
 * "Ajouter un lien" meanwhile. A link added lands at the end, its name ready
 * to be typed.
 */
function LinkList({ config, onChange }: WidgetConfigProps) {
  const links = linkEntries(config);
  const [held, setHeld] = useState<number | null>(null);
  /** The row that was just added: its name takes focus. */
  const [toFill, setToFill] = useState<number | null>(null);
  const selection = useRowSelection(links.map((_, rank) => rank));

  const store = (next: LinkEntry[]) => onChange(withLinks(config, next));
  const change = <K extends keyof LinkEntry>(rank: number, field: K, value: LinkEntry[K]) =>
    store(links.map((l, i) => (i === rank ? { ...l, [field]: value } : l)));

  const add = () => {
    store([...links, { label: "", url: "", opening: "blank" }]);
    setToFill(links.length);
  };

  const removeChecked = () => {
    store(links.filter((_, i) => !selection.isChecked(i)));
    selection.reset();
  };

  // The held row takes the place of the one it hovers: the list reorders under
  // the pointer, and the configuration follows. Rows are known by their rank:
  // the checks are dropped rather than left on the wrong rows.
  const dragHover = (e: DragEvent<HTMLElement>, rank: number) => {
    if (held === null) return;
    e.preventDefault();
    const next = move(links, held, rank);
    if (!next) return;
    setHeld(rank);
    selection.reset();
    store(next);
  };

  // A new widget opens on its only link, still empty: its name is typed first.
  const fresh = links.length === 1 && !links[0]!.label && !links[0]!.url;

  return (
    <Input.Wrapper label="Liens">
      {links.length === 0 ? (
        <EmptyList icon={IconLink} message="Aucun lien" />
      ) : (
        <Stack gap={1}>
          {links.map((entry, rank) => {
            const name = entry.label || entry.url || "Lien";
            return (
              <Group
                key={rank}
                gap="sm"
                wrap="nowrap"
                onDragOver={(e) => dragHover(e, rank)}
                onDrop={(e) => e.preventDefault()}
                style={rowStyle(rank, links.length, held === rank)}
              >
                <Handle
                  label={`Déplacer le lien ${name}`}
                  active={links.length > 1}
                  onDragStart={() => setHeld(rank)}
                  onDragEnd={() => setHeld(null)}
                />
                <RowCheckbox
                  label={`Sélectionner ${name}`}
                  checked={selection.isChecked(rank)}
                  onChange={(on) => selection.toggle(rank, on)}
                  afterHandle
                />
                {/* The name aligns with the checkbox, as a column's. */}
                <Group gap={4} wrap="nowrap" style={{ flex: 1, minWidth: 0, marginLeft: -NAME_INSET }}>
                  <LinkField
                    value={entry.label}
                    onChange={(v) => change(rank, "label", v)}
                    placeholder="Nom"
                    label="Nom du lien"
                    flex={2}
                    autoFocus={toFill === rank || (fresh && rank === 0)}
                  />
                  <LinkField
                    value={entry.url}
                    onChange={(v) => change(rank, "url", v)}
                    placeholder="https://"
                    label="URL du lien"
                    flex={3}
                  />
                  <Select
                    size="xs"
                    radius={ROUNDING}
                    w={OPENING_WIDTH}
                    style={{ flexShrink: 0 }}
                    aria-label="Ouverture du lien"
                    data={OPENINGS}
                    value={entry.opening}
                    onChange={(v) => v && change(rank, "opening", v as LinkOpening)}
                    allowDeselect={false}
                    comboboxProps={{ withinPortal: true }}
                  />
                </Group>
              </Group>
            );
          })}
        </Stack>
      )}
      <ListFooter
        addLabel="Ajouter un lien"
        onAdd={add}
        checkedCount={selection.checked.length}
        onDeleteChecked={removeChecked}
      />
    </Input.Wrapper>
  );
}

export const linkWidget: AccessWidget = {
  type: "link",
  kind: "common",
  label: "Lien",
  icon: IconLink,
  defaultConfig: { links: [{ label: "", url: "", opening: "blank" }] },
  // A single click belongs to the links: the page does not wrap it in a
  // button that would open the drawer.
  ownClicks: true,
  // Locked, with all its links switched off, it disappears altogether.
  hidden: (config, locked) => locked && linkEntries(config).every((l) => l.opening === "off"),
  drawerSize: DRAWER_WIDTH,

  Display: LinkWidget,

  // Tight like a paragraph's lines: the line height is enough to separate them.
  margins: () => ({ top: 0, bottom: 0 }),

  // With no chosen color, the link follows the text's: white on the dark
  // theme, black on the light one. The color field shows it, as the date's
  // (widgets/common/date): brought back to it, it is no longer stored, and the
  // link keeps following the scheme. Its size, brought back to the default,
  // is no longer stored either.
  appearance: (config, onChange) => {
    const size = count(config, SIZE, DEFAULT_SIZE);
    const defaultColor = themeColor("widget-text");
    const color = text(config, COLOR);
    return [
      {
        name: "Texte",
        what: "du lien",
        color: {
          value: color || defaultColor,
          onChange: (v) => onChange(insertRow(config, { [COLOR]: v === defaultColor ? "" : v })),
        },
        size: {
          value: size,
          defaultValue: DEFAULT_SIZE,
          min: SIZE_MIN,
          max: SIZE_MAX,
          onChange: (v) => onChange(insertRow(config, { [SIZE]: v === DEFAULT_SIZE ? "" : v })),
        },
        modified: (color !== "" && color !== defaultColor) || size !== DEFAULT_SIZE,
        reset: () => onChange(insertRow(config, { [COLOR]: "", [SIZE]: "" })),
      },
      formatRow(config, onChange),
    ];
  },

  Config: LinkList,
};
