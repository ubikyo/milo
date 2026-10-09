import {
  Box,
  Group,
  Select,
  ScrollArea,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Title,
  Tooltip,
  Tree,
  useComputedColorScheme,
  useTree,
  type TreeNodeData,
} from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import { useMemo } from "react";
import {
  THEME_COLOR_GROUPS,
  THEME_COLORS,
  THEME_SIDES,
  THEME_SIZES,
  cleanThemeSize,
  hexaString,
  parseThemeColor,
  themePaddingOf,
  themeWindowDefault,
  themeWindowKey,
} from "@milo/shared";
import type { ThemeColorDefinition, ThemeColors, ThemeSizeDefinition } from "@milo/shared";
import type { CSSProperties, FocusEvent, PointerEvent } from "react";
import { errorMessage, notifyError } from "../../lib/errors";
import {
  defaultHexaOf,
  themeHexaOf,
  themeSizeDefaultOf,
  themeSizeOf,
  updateThemeColors,
  useThemeColors,
  type Scheme,
} from "../../lib/themeColors";
import { THEME_SHADES, THEME_SHADES_PER_ROW } from "../../widgets/style-fields";
import { ROW_INSET, rowStyle } from "../ui/DrawerRows";
import { Color, Reset, Size, Weight } from "../ui/SettingRows";
import { H2_GAP } from "../../widgets/common/h2";
import { THEME_EDITOR_ATTRIBUTE, highlightThemeKey } from "./ThemeHighlight";
import classes from "../../assets/styles/ThemePanel.module.css";

// One of the theme editor's panels: the colors and sizes of one kind of
// element — the general interface, a window, a drawer —, in the theme the
// screen shows. A change shows at once, everywhere, and is saved shortly
// after (themeColors).

/** A panel's width before its levels: each one adds INDENT (themePanelWidth). */
export const THEME_PANEL_WIDTH = 270;

/** Between the interface and its docked panel, as between a window and its own. */
export const THEME_INTERFACE_GAP = 1;

export type ThemePanelKind = "interface" | "modal" | "drawer";

/** Set on a window's content: the styles it takes (THEME_COLOR_GROUPS' "scope"). */
export { THEME_SCOPE_ATTRIBUTE } from "../../lib/themeWindow";

const PADDING = 30;

/** The space between a group's rows, and under its title (H2_GAP). */
const GAP = H2_GAP;

/** Each level of the tree steps in by this much; the panel widens as much per level. */
const INDENT = 12;

/** The space between a group's fields and its subgroups. */
const SUBGROUPS_GAP = 30;

/** An expanded title's size, by level; deeper, the labels' "sm". */
const TITLE_SIZES = [18, 16, 14];

/** The groups as a tree: each under its parent, when the panel shows it. */
const treeOf = (groups: typeof THEME_COLOR_GROUPS): TreeNodeData[] => {
  const shown = new Set(groups.map((g) => g.key));
  const nodes = (parent?: string): TreeNodeData[] =>
    groups
      .filter((g) => (g.parent && shown.has(g.parent) ? g.parent : undefined) === parent)
      .map((g) => {
        const children = nodes(g.key);
        return { value: g.key, label: g.label, ...(children.length ? { children } : {}) };
      });
  return nodes();
};

/** The reset button's width (ActionIcon "md"), and its gap to the field. */
const RESET_WIDTH = 28;
const RESET_GAP = 8;

/** A field fills the row, after its inset and the reset button. */
const FIELD_WIDTH = THEME_PANEL_WIDTH - 2 * PADDING - 2 * ROW_INSET - RESET_WIDTH - RESET_GAP;

/** The fields' background: that of the widgets drawer's rows (WidgetDrawer). */
const FIELD_BACKGROUND = "var(--milo-inset-bg)";

/**
 * The reset button and the field in one control, like an appearance's rows
 * in a widget's drawer (SettingRows), on the fields' background.
 */
const FIELD_ROW: CSSProperties = {
  ...rowStyle(0, 1, false),
  padding: ROW_INSET,
  backgroundColor: FIELD_BACKGROUND,
};


/**
 * The groups each panel sets. The windows' header and tabs are shared by
 * modals and drawers: both panels carry them.
 */
const PANEL_GROUPS: Record<ThemePanelKind, string[]> = {
  interface: [
    "main-tabs",
    "main-active-tab",
    "scale",
    "base",
    "surfaces",
    "lines",
    "widgets",
    "charts",
    "clock",
    "m365",
  ],
  modal: ["dialogs", "tabs", "active-tab"],
  drawer: ["dialogs", "drawers", "tabs", "active-tab"],
};

/** A panel's tree: its groups — an interface's own, when it has them. */
const panelTree = (kind: ThemePanelKind, scope?: string | null): TreeNodeData[] =>
  treeOf(
    THEME_COLOR_GROUPS.filter((g) =>
      scope ? g.scope === scope : !g.scope && PANEL_GROUPS[kind].includes(g.key),
    ),
  );

/** The tree's number of levels. */
const depthOf = (nodes: TreeNodeData[]): number =>
  nodes.length ? 1 + Math.max(...nodes.map((n) => depthOf(n.children ?? []))) : 0;

/**
 * A panel's width: its fields keep theirs at every level, the panel widens
 * by a step (INDENT) per level — the fields step in under their title.
 */
export const themePanelWidth = (kind: ThemePanelKind, scope?: string | null): number =>
  THEME_PANEL_WIDTH + INDENT * depthOf(panelTree(kind, scope)) + (scope ? OWN_MARGIN + OWN_SIZE + OWN_GAP : 0);

/**
 * Beside a window, each style's switch — its own value or the style's —, in
 * its control: its width (Mantine's "xs"), and its gap to the reset button
 * (RESET_GAP).
 */
const OWN_SIZE = 32;
const OWN_GAP = 8;

/** The space on the switch's left, inside the control. */
const OWN_MARGIN = 3;

/** The groups of "Thèmes spécifiques", whatever their depth: their styles are one window's anyway. */
const SPECIFIC_GROUPS = (() => {
  const under = new Set(["settings-specific"]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const g of THEME_COLOR_GROUPS)
      if (g.parent && under.has(g.parent) && !under.has(g.key)) {
        under.add(g.key);
        grew = true;
      }
  }
  return under;
})();

/**
 * The scrollbar along the panel's right edge, over its whole height, title
 * included — like the Settings' (SettingsModal).
 */
const SCROLLBAR_STYLES = {
  root: { position: "static" as const },
  scrollbar: {
    position: "absolute" as const,
    top: 0,
    bottom: 0,
    right: 0,
    left: "auto",
    height: "auto",
    width: "var(--scrollarea-scrollbar-size)",
  },
};

const onError = (e: unknown) => notifyError(errorMessage(e));

/** A padding's sides, in the order of its row — that of CSS. */
const SIDE_FIELDS = {
  top: { arrow: "↑", what: "haut" },
  right: { arrow: "→", what: "droit" },
  bottom: { arrow: "↓", what: "bas" },
  left: { arrow: "←", what: "gauche" },
};

/** A margin's or a gap's arrow (direction): a side's, or both ways. */
const arrowOf = (direction: ThemeSizeDefinition["direction"]) =>
  direction === "vertical"
    ? "↕"
    : direction === "horizontal"
      ? "↔"
      : direction
        ? SIDE_FIELDS[direction].arrow
        : undefined;

/** "Auto" or a size in pixels (ThemeSizeDefinition's "auto"): the choice's width. */
const AUTO_WIDTH = 72;

/** The size a choice of "px" starts at. */
const AUTO_PX = 600;

/** The share a choice of "%" starts at. */
const AUTO_PERCENT = 80;

/** Two sides per line, within the field's width. */
const SIDE_GAP = 6;

/**
 * A group's colors, then its sizes — each after the color it names (after),
 * if any. A padding is one row: its first side stands for them all.
 */
const groupRows = (group: string): (ThemeColorDefinition | ThemeSizeDefinition)[] => {
  // A padding's first side stands for its row: "top", or the first it has.
  const firstSide = (s: ThemeSizeDefinition) =>
    THEME_SIZES.find((d) => d.side && themePaddingOf(d.key) === themePaddingOf(s.key)) === s;
  const sizes = THEME_SIZES.filter((s) => s.group === group && (!s.side || firstSide(s)));
  const placed = (key: string) => sizes.filter((s) => s.after === key);
  return [
    ...THEME_COLORS.filter((c) => c.group === group).flatMap((c) => [c, ...placed(c.key)]),
    ...sizes.filter((s) => !s.after),
  ];
};

export default function ThemePanel({
  kind,
  scope,
  window = null,
  canEdit,
  style,
}: {
  kind: ThemePanelKind;
  /** The interface beside which it stands has its own colors: only those. */
  scope?: string | null;
  /**
   * The window beside which it stands, by its name (themeWindow): a style
   * may take a value for it only.
   */
  window?: string | null;
  canEdit: boolean;
  /** Its place: docked beside the interface, or floating beside a window. */
  style?: CSSProperties;
}) {
  const scheme: Scheme = useComputedColorScheme("light");
  // The expanded groups: none on opening.
  const controller = useTree();
  // The theme the page shows: it is the one edited.
  const colors = useThemeColors(scheme);
  // Built once per panel: the tree folds everything back each time its
  // data changes (Mantine's Tree initializes on it).
  const tree = useMemo(() => panelTree(kind, scope), [kind, scope]);
  const width = themePanelWidth(kind, scope);
  /** A field fills its row, at every level: the panel's width, less its title's step and its own. */
  const fieldWidth = (level: number) =>
    FIELD_WIDTH + width - THEME_PANEL_WIDTH - INDENT * level - (window ? OWN_MARGIN + OWN_SIZE + OWN_GAP : 0);

  /** A style's own value in the window beside which the panel stands: its stored key. */
  const ownKey = (key: string) => (window ? themeWindowKey(key, window) : key);
  /** The window's own value of the style by default, if any (THEME_WINDOW_DEFAULTS). */
  const ownDefault = (key: string) => (window ? themeWindowDefault(key, window) : undefined);
  /**
   * The window has its own value of the style (its box checked): edits go
   * there. By default for some — unless it follows the style's.
   */
  const isOwn = (key: string) => {
    if (window === null) return false;
    const entry = colors[ownKey(key)];
    return entry ? !entry.inherit : ownDefault(key) !== undefined;
  };

  /** The color the field shows: the window's own, otherwise the style's. */
  const hexaOf = (key: string) => {
    const own = isOwn(key) ? colors[ownKey(key)]?.[scheme] : undefined;
    return own ?? themeHexaOf(key, scheme);
  };

  /** The size the field shows: the window's own, otherwise the style's. */
  const sizeOf = (key: string) => {
    if (!isOwn(key)) return themeSizeOf(key, scheme);
    return colors[ownKey(key)]?.sizes?.[scheme] ?? ownDefault(key) ?? themeSizeOf(key, scheme);
  };

  /**
   * Stores a style's value in the theme shown, in the window's own entry when
   * it has one — there, the style's value is not stored, the window follows
   * it; and the entry stays, its box checked. Otherwise the style's value,
   * not stored either when it is its default.
   */
  const store = (key: string, value: { color?: string; size?: number } | null, isDefault: boolean) => {
    const own = isOwn(key);
    const stored = own ? ownKey(key) : key;
    const entry: ThemeColors[string] = { ...colors[stored] };
    if (value?.size !== undefined || (value === null && THEME_SIZES.some((d) => d.key === key))) {
      const sizes = { ...entry.sizes };
      if (value?.size === undefined || isDefault) delete sizes[scheme];
      else sizes[scheme] = value.size;
      if (sizes.light !== undefined || sizes.dark !== undefined) entry.sizes = sizes;
      else delete entry.sizes;
    } else {
      if (value?.color === undefined || isDefault) delete entry[scheme];
      else entry[scheme] = value.color;
    }
    const next: ThemeColors = { ...colors };
    if (own || entry.light || entry.dark || entry.sizes) next[stored] = entry;
    else delete next[stored];
    updateThemeColors(scheme, next, onError);
  };

  /**
   * Sets the color, as #rrggbbaa whatever its writing; brought back to its
   * default — for a window, the style's —, it is no longer stored. The other
   * theme's value stays.
   */
  const change = (key: string, value: string) => {
    const picked = parseThemeColor(value);
    if (!canEdit || !picked) return;
    // A transparent color — a tab's background, by default — given another
    // hue: it is made opaque, otherwise the pick would not show at all.
    const before = parseThemeColor(hexaOf(key));
    const parsed =
      picked.a === 0 && before?.a === 0 && (picked.r !== before.r || picked.g !== before.g || picked.b !== before.b)
        ? { ...picked, a: 1 }
        : picked;
    const hexa = hexaString(parsed);
    const base = isOwn(key) ? themeHexaOf(key, scheme) : defaultHexaOf(key, scheme);
    store(key, { color: hexa }, hexa === base);
  };

  /** Sets a size; emptied or brought back to its default — for a window, the style's —, it is no longer stored. */
  const changeSize = (key: string, value: number | "") => {
    const definition = THEME_SIZES.find((s) => s.key === key);
    if (!canEdit || !definition) return;
    const size = value === "" ? null : cleanThemeSize(definition, value);
    const base = isOwn(key) ? (ownDefault(key) ?? themeSizeOf(key, scheme)) : themeSizeDefaultOf(key, scheme);
    store(key, size === null ? null : { size }, size === null || size === base);
  };

  /** Brings the values back to their default — for a window, the style's —, in the theme shown only. */
  const reset = (...keys: string[]) => {
    const next: ThemeColors = { ...colors };
    for (const key of keys) {
      const own = isOwn(key);
      const stored = own ? ownKey(key) : key;
      const entry = colors[stored];
      if (!entry) continue;
      const { [scheme]: _color, sizes, ...rest } = entry;
      const { [scheme]: _size, ...otherSizes } = sizes ?? {};
      const kept: ThemeColors[string] = Object.keys(otherSizes).length
        ? { ...rest, sizes: otherSizes }
        : rest;
      if (own || Object.keys(kept).length) next[stored] = kept;
      else delete next[stored];
    }
    updateThemeColors(scheme, next, onError);
  };

  /**
   * Gives the window its own values of the styles — following theirs until
   * set —, or takes them back: the window then follows the styles again.
   */
  const setOwn = (keys: string[], on: boolean) => {
    if (!canEdit || !window) return;
    const next: ThemeColors = { ...colors };
    for (const key of keys) {
      const stored = ownKey(key);
      const byDefault = ownDefault(key) !== undefined;
      // Checked: its own value — the default one, if it has one. Unchecked:
      // the style's — said so, when it has one by default.
      if (on) next[stored] = byDefault ? {} : (next[stored] ?? {});
      else if (byDefault) next[stored] = { inherit: true };
      else delete next[stored];
    }
    updateThemeColors(scheme, next, onError);
  };

  /**
   * In a style's control, beside a window: its switch, on when the window
   * has its own values; a style of "Thèmes spécifiques" is the window's anyway, an
   * empty space keeps the controls aligned. Beside the interface, nothing.
   */
  const ownBox = (keys: string[], group: string, label: string) => {
    if (!window) return null;
    if (SPECIFIC_GROUPS.has(group)) return <Box w={OWN_SIZE} ml={OWN_MARGIN} style={{ flexShrink: 0 }} />;
    return (
      <Tooltip label="Propre à cette fenêtre" withinPortal>
        <Switch
          size="xs"
          color="teal"
          // A padding's sides go together: on when all are the window's.
          checked={keys.every(isOwn)}
          onChange={(e) => setOwn(keys, e.currentTarget.checked)}
          disabled={!canEdit}
          aria-label={`« ${label} » propre à cette fenêtre`}
          ml={OWN_MARGIN}
          style={{ flexShrink: 0, alignSelf: "center" }}
        />
      </Tooltip>
    );
  };

  /**
   * A field in focus — or its reset button — frames what it colors in the
   * page; leaving it for another of the row keeps the frames.
   */
  const focusFrames = (key: string) => ({
    onFocus: () => highlightThemeKey({ key, scheme }),
    // A size's arrows don't take the focus: a click on them gives it to
    // the field, which then frames its elements.
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (!(e.target as Element).closest(".mantine-NumberInput-controls")) return;
      e.currentTarget.querySelector("input")?.focus();
    },
    onBlur: (e: FocusEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) highlightThemeKey(null);
    },
  });

  /** The field differs from its default — for a window of its own, from the style's. */
  const modified = (key: string) => {
    const stored = colors[isOwn(key) ? ownKey(key) : key];
    return stored?.[scheme] !== undefined || stored?.sizes?.[scheme] !== undefined;
  };

  const colorRow = (c: ThemeColorDefinition, width: number) => (
    <Stack key={c.key} gap={2}>
      <Text size="xs" title={c.hint}>
        {c.label}
      </Text>
      <Group gap={RESET_GAP} wrap="nowrap" style={FIELD_ROW} {...focusFrames(c.key)}>
        {ownBox([c.key], c.group, c.label)}
        <Reset
          active={modified(c.key)}
          what={`« ${c.label} »`}
          onClick={() => reset(c.key)}
        />
        <Color
          width={width}
          background={FIELD_BACKGROUND}
          value={hexaOf(c.key)}
          onChange={(v) => change(c.key, v)}
          format="hexa"
          swatches={THEME_SHADES}
          swatchesPerRow={THEME_SHADES_PER_ROW}
          eyeDropper
          label={`Couleur « ${c.label} »`}
        />
      </Group>
    </Stack>
  );

  /** A padding's row: its four sides, two per line, and one reset button for them all. */
  const paddingRow = (s: ThemeSizeDefinition, width: number) => {
    const padding = themePaddingOf(s.key);
    // Its sides — all four, or only some (paddingSizes).
    const sides = THEME_SIDES.filter((side) => THEME_SIZES.some((d) => d.key === `${padding}-${side}`));
    const keys = sides.map((side) => `${padding}-${side}`);
    return (
      <Stack key={padding} gap={2}>
        <Text size="xs" title={s.hint}>
          {s.label}
        </Text>
        {/* Its switch and reset button centered on its lines. */}
        <Group gap={RESET_GAP} wrap="nowrap" align="center" style={FIELD_ROW}>
          {ownBox(keys, s.group, s.label)}
          <Reset
            active={keys.some(modified)}
            what={`« ${s.label} »`}
            onClick={() => reset(...keys)}
          />
          {/* Two sides per line; a single side fills it. */}
          <SimpleGrid cols={Math.min(2, sides.length)} spacing={SIDE_GAP} verticalSpacing={SIDE_GAP} w={width}>
            {sides.map((side) => {
              const key = `${padding}-${side}`;
              const definition = THEME_SIZES.find((d) => d.key === key)!;
              return (
                <Box key={key} {...focusFrames(key)}>
                  <Size
                    first={false}
                    label={`Padding ${SIDE_FIELDS[side].what} « ${s.label} »`}
                    size={{
                      value: sizeOf(key),
                      defaultValue: themeSizeDefaultOf(key, scheme),
                      min: definition.min,
                      max: definition.max,
                      prefix: SIDE_FIELDS[side].arrow,
                      suffix: " px",
                      width: sides.length > 1 ? (width - SIDE_GAP) / 2 : width,
                      background: FIELD_BACKGROUND,
                      onChange: (v) => changeSize(key, v),
                    }}
                  />
                </Box>
              );
            })}
          </SimpleGrid>
        </Group>
      </Stack>
    );
  };

  /** A size; a weight — without a unit — is chosen in the list of its values. */
  const sizeRow = (s: ThemeSizeDefinition, width: number) => {
    if (s.side) return paddingRow(s, width);
    const value = sizeOf(s.key);
    // "Auto" (0), pixels, or a percentage (negative).
    const mode = value === 0 ? "auto" : value < 0 ? "%" : "px";
    return (
      <Stack key={s.key} gap={2}>
        <Text size="xs" title={s.hint}>
          {s.label}
        </Text>
        <Group gap={RESET_GAP} wrap="nowrap" style={FIELD_ROW} {...focusFrames(s.key)}>
          {ownBox([s.key], s.group, s.label)}
          <Reset
            active={modified(s.key)}
            what={`« ${s.label} »`}
            onClick={() => reset(s.key)}
          />
          {s.auto ? (
            // "Auto", pixels or a percentage, then the size.
            <Group gap={SIDE_GAP} wrap="nowrap" w={width}>
              <Select
                size="xs"
                radius="xs"
                w={mode === "auto" ? width : AUTO_WIDTH}
                data={[
                  { value: "auto", label: "Auto" },
                  { value: "px", label: "px" },
                  { value: "%", label: "%" },
                ]}
                value={mode}
                onChange={(v) => v && v !== mode && changeSize(s.key, v === "auto" ? 0 : v === "%" ? -AUTO_PERCENT : AUTO_PX)}
                allowDeselect={false}
                aria-label={`Mode « ${s.label} »`}
                styles={{ input: { backgroundColor: FIELD_BACKGROUND } }}
              />
              {mode !== "auto" && (
                <Size
                  first={false}
                  label={`Taille « ${s.label} »`}
                  size={{
                    value: Math.abs(value),
                    defaultValue: mode === "%" ? AUTO_PERCENT : AUTO_PX,
                    min: 1,
                    max: mode === "%" ? 100 : s.max,
                    suffix: mode === "%" ? " %" : " px",
                    width: width - AUTO_WIDTH - SIDE_GAP,
                    background: FIELD_BACKGROUND,
                    onChange: (v) => changeSize(s.key, v === "" ? "" : mode === "%" ? -v : v),
                  }}
                />
              )}
            </Group>
          ) : s.unit === "" ? (
            <Weight
              label={`Graisse « ${s.label} »`}
              value={sizeOf(s.key)}
              onChange={(v) => changeSize(s.key, v)}
              width={width}
              background={FIELD_BACKGROUND}
            />
          ) : (
            <Size
              first={false}
              label={`Taille « ${s.label} »`}
              size={{
                value: sizeOf(s.key),
                defaultValue: themeSizeDefaultOf(s.key, scheme),
                min: s.min,
                max: s.max,
                step: s.step,
                prefix: arrowOf(s.direction),
                suffix: ` ${s.unit}`,
                width,
                background: FIELD_BACKGROUND,
                onChange: (v) => changeSize(s.key, v),
              }}
            />
          )}
        </Group>
      </Stack>
    );
  };

  return (
    <Stack
      {...{ [THEME_EDITOR_ATTRIBUTE]: "" }}
      className={classes.panel}
      gap={0}
      style={{
        width,
        // Anchor for the scrollbar; the docked panel's "fixed" does as well.
        position: "relative",
        ...style,
      }}
    >
      {/* The widgets drawer's title (WidgetDrawer): an "H1", 20 px above
          the list. */}
      <Title order={1} size={18} c="var(--milo-strong-text)" p={PADDING} pb={20}>
        Thème
      </Title>
      <ScrollArea
        type="auto"
        scrollbarSize={2}
        styles={SCROLLBAR_STYLES}
        style={{ flex: 1, minHeight: 0 }}
      >
        {/* The groups in a tree, each one's fields under its title, then
            the groups nested in it: all collapsed on opening — you expand
            what you came to set. Collapsed, a title is gray like the
            labels; expanded, that of a section, smaller at each level. */}
        <Box px={PADDING} pb={PADDING}>
          <Tree
            data={tree}
            tree={controller}
            levelOffset={INDENT}
            classNames={{ node: classes.node }}
            renderNode={({ node, level, expanded, hasChildren, elementProps }) => {
              const rows = groupRows(node.value);
              // A group's fields step in like its subgroups.
              const indent = INDENT * level;
              return (
                <>
                  <Group
                    {...elementProps}
                    // Open, its node is spaced from the next (ThemePanel.module.css).
                    data-open={expanded || undefined}
                    justify="space-between"
                    wrap="nowrap"
                    py={6}
                  >
                    <Title
                      order={2}
                      size={expanded ? TITLE_SIZES[level - 1] ?? "sm" : "sm"}
                      fw={expanded ? undefined : 400}
                      c={expanded ? "var(--milo-strong-text)" : "dimmed"}
                    >
                      {node.label}
                    </Title>
                    {(hasChildren || rows.length > 0) && (
                      <IconChevronDown
                        size={14}
                        color="var(--mantine-color-dimmed)"
                        style={{
                          flexShrink: 0,
                          transform: expanded ? "rotate(180deg)" : undefined,
                          transition: "transform 150ms ease",
                        }}
                      />
                    )}
                  </Group>
                  {expanded && rows.length > 0 && (
                    // The fields are not the tree's: a click or a key in
                    // them neither folds the group nor moves in the tree.
                    <Stack
                      gap={GAP}
                      pt={GAP / 2}
                      // Spaced from the subgroups that follow.
                      pb={hasChildren ? SUBGROUPS_GAP : 0}
                      pl={indent}
                      style={{ cursor: "auto", userSelect: "text" }}
                      onKeyDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {rows.map((row) =>
                        "light" in row ? colorRow(row, fieldWidth(level)) : sizeRow(row, fieldWidth(level)),
                      )}
                    </Stack>
                  )}
                </>
              );
            }}
          />
        </Box>
      </ScrollArea>
    </Stack>
  );
}
