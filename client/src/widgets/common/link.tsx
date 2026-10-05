import { Anchor, Select, Stack, Switch, Text, TextInput } from "@mantine/core";
import { IconLink } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import classes from "../../assets/styles/AccessLink.module.css";
import { editKeys } from "../../components/ui/DrawerRows";
import { insertRow } from "../../components/ui/SettingRows";
import { formatOf, formatRow, formatStyle } from "../text-format";
import { withField, count, text } from "../types";
import type { AccessWidget, WidgetDisplayProps } from "../types";
import { themeColor } from "../../lib/themeColors";

// A link: a service's address, the word that designates it, and the means to
// switch it off without losing it.
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

const LABEL = "label";
const URL = "url";
const ACTIVE = "enabled";
const COLOR = "color";
const SIZE = "size";
/** Where the address opens: "blank", another page (the default), or "self", the page itself. */
const OPENING = "opening";

const OPENINGS = [
  { value: "self", label: "Dans la fenêtre" },
  { value: "blank", label: "Dans une nouvelle fenêtre" },
];

const inNewWindow = (config: unknown): boolean => text(config, OPENING) !== "self";

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
 * The anchor needs one more precaution. Mantine sets it back to
 * "display: inline", and that rule comes after the one that makes it a block
 * to truncate it to one line. Left inline, the anchor no longer drives its
 * row's height: the container's line height sets it, i.e. the page body's —
 * nearly 25 pixels for a 14-pixel word. It is therefore set back to block, in
 * the form that the one-line truncation requires.
 */
const LINK_ROW = {
  ...LINE_SPACING,
  display: "-webkit-box" as const,
  // The anchor stops at the word: as a block, it would take the whole column
  // and the hover would light up well beyond the text. "max-width" still caps
  // it, otherwise an overly long label would overflow instead of being cut.
  width: "fit-content" as const,
  maxWidth: "100%" as const,
};

/** A new link is switched on: it is created to be used. */
const isActive = (config: unknown): boolean => {
  const value = (config as Record<string, unknown> | null)?.[ACTIVE];
  return value === undefined ? true : Boolean(value);
};

function LinkWidget({ config, onChange, locked }: WidgetDisplayProps) {
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

  const url = text(config, URL);
  const title = text(config, LABEL);
  const label = title || url;
  const active = isActive(config);
  const color = text(config, COLOR) || DEFAULT_COLOR;
  const size = count(config, SIZE, DEFAULT_SIZE);
  const format = formatStyle(formatOf(config));
  const newWindow = inNewWindow(config);

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
    await onChange(withField(config, LABEL, newValue));
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
  // locked, it no longer appears at all (see "hidden" below).
  if (!active) {
    return (
      <Text
        style={{ ...LINE_SPACING, ...format, fontSize: size, textDecoration: "line-through" }}
        c="dimmed"
        onDoubleClick={doubleClick}
        lineClamp={1}
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
        style={{ ...LINE_SPACING, ...format, fontSize: size }}
        c={color}
        onDoubleClick={doubleClick}
        lineClamp={1}
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
      lineClamp={1}
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

export const linkWidget: AccessWidget = {
  type: "link",
  kind: "common",
  label: "Lien",
  icon: IconLink,
  defaultConfig: { [LABEL]: "", [URL]: "", [ACTIVE]: true },
  // A single click belongs to the link: the page does not wrap it in a
  // button that would open the drawer.
  ownClicks: true,
  // Switched off and locked, it disappears: nobody needs to see it anymore,
  // and nobody can switch it back on anyway.
  hidden: (config, locked) => locked && !isActive(config),

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

  Config: ({ config, onChange }) => (
    <Stack gap="xl">
      <TextInput
        label="Nom"
        placeholder="Nom du lien"
        value={text(config, LABEL)}
        onChange={(e) => onChange(withField(config, LABEL, e.currentTarget.value))}
        {...editKeys((value) => onChange(withField(config, LABEL, value)))}
        autoFocus
      />
      <TextInput
        label="URL"
        placeholder="https://"
        value={text(config, URL)}
        onChange={(e) => onChange(withField(config, URL, e.currentTarget.value))}
        {...editKeys((value) => onChange(withField(config, URL, value)))}
      />
      <Select
        label="Ouverture"
        data={OPENINGS}
        value={inNewWindow(config) ? "blank" : "self"}
        onChange={(v) => v && onChange(withField(config, OPENING, v))}
        allowDeselect={false}
        comboboxProps={{ withinPortal: true }}
      />
    </Stack>
  ),

  // Switch off rather than delete: the address is kept, it simply no longer
  // shows once the category is locked. Placed after the margins, last in the
  // drawer.
  ConfigEnd: ({ config, onChange }) => (
    <Switch
      label="Activé"
      checked={isActive(config)}
      onChange={(e) => onChange(withField(config, ACTIVE, e.currentTarget.checked))}
      color="teal"
    />
  ),
};
