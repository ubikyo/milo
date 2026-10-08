import {
  Box,
  Group,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  Title,
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

/**
 * Set on a window's content by an interface that has its own colors — the
 * widgets drawer —: its name, that its groups carry (THEME_COLOR_GROUPS' "scope").
 */
export const THEME_SCOPE_ATTRIBUTE = "data-theme-scope";

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
  THEME_PANEL_WIDTH + INDENT * depthOf(panelTree(kind, scope));

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

/** Two sides per line, within the field's width. */
const SIDE_GAP = 6;

/**
 * A group's colors, then its sizes — each after the color it names (after),
 * if any. A padding is one row: its top side stands for the four.
 */
const groupRows = (group: string): (ThemeColorDefinition | ThemeSizeDefinition)[] => {
  const sizes = THEME_SIZES.filter((s) => s.group === group && (!s.side || s.side === "top"));
  const placed = (key: string) => sizes.filter((s) => s.after === key);
  return [
    ...THEME_COLORS.filter((c) => c.group === group).flatMap((c) => [c, ...placed(c.key)]),
    ...sizes.filter((s) => !s.after),
  ];
};

export default function ThemePanel({
  kind,
  scope,
  canEdit,
  style,
}: {
  kind: ThemePanelKind;
  /** The interface beside which it stands has its own colors: only those. */
  scope?: string | null;
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
  const fieldWidth = (level: number) => FIELD_WIDTH + width - THEME_PANEL_WIDTH - INDENT * level;

  /**
   * Sets the color, as #rrggbbaa whatever its writing; brought back to its
   * default, it is no longer stored. The other theme's value stays.
   */
  const change = (key: string, value: string) => {
    const parsed = parseThemeColor(value);
    if (!canEdit || !parsed) return;
    const hexa = hexaString(parsed);
    const own = { ...colors[key] };
    if (hexa === defaultHexaOf(key, scheme)) delete own[scheme];
    else own[scheme] = hexa;
    const next: ThemeColors = { ...colors };
    if (own.light || own.dark) next[key] = own;
    else delete next[key];
    updateThemeColors(scheme, next, onError);
  };

  /** Sets a size; emptied or brought back to its default, it is no longer stored. */
  const changeSize = (key: string, value: number | "") => {
    const definition = THEME_SIZES.find((s) => s.key === key);
    if (!canEdit || !definition) return;
    const size = value === "" ? null : cleanThemeSize(definition, value);
    const sizes = { ...colors[key]?.sizes };
    if (size === null || size === themeSizeDefaultOf(key, scheme)) delete sizes[scheme];
    else sizes[scheme] = size;
    const next: ThemeColors = { ...colors };
    if (sizes.light !== undefined || sizes.dark !== undefined) next[key] = { sizes };
    else delete next[key];
    updateThemeColors(scheme, next, onError);
  };

  /** Brings the values back to their default, in the theme shown only. */
  const reset = (...keys: string[]) => {
    const next: ThemeColors = { ...colors };
    for (const key of keys) {
      const own = colors[key];
      if (!own) continue;
      const { [scheme]: _color, sizes, ...rest } = own;
      const { [scheme]: _size, ...otherSizes } = sizes ?? {};
      const kept: ThemeColors[string] = Object.keys(otherSizes).length
        ? { ...rest, sizes: otherSizes }
        : rest;
      if (Object.keys(kept).length) next[key] = kept;
      else delete next[key];
    }
    updateThemeColors(scheme, next, onError);
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

  const modified = (key: string) =>
    colors[key]?.[scheme] !== undefined || colors[key]?.sizes?.[scheme] !== undefined;

  const colorRow = (c: ThemeColorDefinition, width: number) => (
    <Stack key={c.key} gap={2}>
      <Text size="xs" title={c.hint}>
        {c.label}
      </Text>
      <Group gap={RESET_GAP} wrap="nowrap" style={FIELD_ROW} {...focusFrames(c.key)}>
        <Reset
          active={modified(c.key)}
          what={`« ${c.label} »`}
          onClick={() => reset(c.key)}
        />
        <Color
          width={width}
          background={FIELD_BACKGROUND}
          value={themeHexaOf(c.key, scheme)}
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
        <Group gap={RESET_GAP} wrap="nowrap" align="flex-start" style={FIELD_ROW}>
          <Reset
            active={keys.some(modified)}
            what={`« ${s.label} »`}
            onClick={() => reset(...keys)}
          />
          <SimpleGrid cols={2} spacing={SIDE_GAP} verticalSpacing={SIDE_GAP} w={width}>
            {sides.map((side) => {
              const key = `${padding}-${side}`;
              const definition = THEME_SIZES.find((d) => d.key === key)!;
              return (
                <Box key={key} {...focusFrames(key)}>
                  <Size
                    first={false}
                    label={`Padding ${SIDE_FIELDS[side].what} « ${s.label} »`}
                    size={{
                      value: themeSizeOf(key, scheme),
                      defaultValue: themeSizeDefaultOf(key, scheme),
                      min: definition.min,
                      max: definition.max,
                      prefix: SIDE_FIELDS[side].arrow,
                      suffix: " px",
                      width: (width - SIDE_GAP) / 2,
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
    return (
      <Stack key={s.key} gap={2}>
        <Text size="xs" title={s.hint}>
          {s.label}
        </Text>
        <Group gap={RESET_GAP} wrap="nowrap" style={FIELD_ROW} {...focusFrames(s.key)}>
          <Reset
            active={modified(s.key)}
            what={`« ${s.label} »`}
            onClick={() => reset(s.key)}
          />
          {s.unit === "" ? (
            <Weight
              label={`Graisse « ${s.label} »`}
              value={themeSizeOf(s.key, scheme)}
              onChange={(v) => changeSize(s.key, v)}
              width={width}
              background={FIELD_BACKGROUND}
            />
          ) : (
            <Size
              first={false}
              label={`Taille « ${s.label} »`}
              size={{
                value: themeSizeOf(s.key, scheme),
                defaultValue: themeSizeDefaultOf(s.key, scheme),
                min: s.min,
                max: s.max,
                step: s.step,
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
